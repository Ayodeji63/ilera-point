import { useCallback, useEffect, useRef, useState } from "react";

const MEASURE_W = 256;
const MEASURE_H = 144;
const JPEG_QUALITY = .85;
const SAMPLE_MS = 450;
const STABLE_DELTA = 0.009;
const STABLE_FRAMES = 4;
const WASM_ROOT = "/mediapipe/wasm";
const HAND_MODEL = "/mediapipe/models/hand_landmarker.task";

let landmarkerPromise;
function loadLandmarker() {
  if (!landmarkerPromise) landmarkerPromise = (async () => {
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    return HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" }, runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: .65, minHandPresenceConfidence: .65, minTrackingConfidence: .6 });
  })().catch((error) => { landmarkerPromise = null; throw error; });
  return landmarkerPromise;
}

export function preloadPalmRecognition() { void loadLandmarker().catch(() => undefined); }

export function handRegion(landmarks, videoWidth, videoHeight) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21) return null;
  const xs = landmarks.map((point) => point.x * videoWidth); const ys = landmarks.map((point) => point.y * videoHeight);
  const left = Math.max(0, Math.min(...xs)); const right = Math.min(videoWidth, Math.max(...xs));
  const top = Math.max(0, Math.min(...ys)); const bottom = Math.min(videoHeight, Math.max(...ys));
  const width = right - left; const height = bottom - top; const padX = width * .06; const padY = height * .06;
  return { x: Math.max(0, left - padX), y: Math.max(0, top - padY), width: Math.min(videoWidth, right + padX) - Math.max(0, left - padX), height: Math.min(videoHeight, bottom + padY) - Math.max(0, top - padY) };
}

function measureSharpness(video, canvas, region) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  if (region) context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, MEASURE_W, MEASURE_H);
  else context.drawImage(video, 0, 0, MEASURE_W, MEASURE_H);
  const pixels = context.getImageData(0, 0, MEASURE_W, MEASURE_H).data;
  const grey = new Float32Array(MEASURE_W * MEASURE_H);
  for (let source = 0, target = 0; source < pixels.length; source += 4, target += 1) grey[target] = .299 * pixels[source] + .587 * pixels[source + 1] + .114 * pixels[source + 2];
  let sum = 0; let sumSquared = 0; let count = 0;
  for (let y = 1; y < MEASURE_H - 1; y += 1) for (let x = 1; x < MEASURE_W - 1; x += 1) {
    const index = y * MEASURE_W + x;
    const value = grey[index - MEASURE_W] + grey[index + MEASURE_W] + grey[index - 1] + grey[index + 1] - 4 * grey[index];
    sum += value; sumSquared += value * value; count += 1;
  }
  if (!count) return 0;
  const mean = sum / count;
  return sumSquared / count - mean * mean;
}

export function usePalmCamera(active = true) {
  const videoRef = useRef(null); const streamRef = useRef(null); const scratchRef = useRef(null); const fullRef = useRef(null);
  const [status, setStatus] = useState("starting"); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false; let timedOut = false; setStatus("starting");
    const timer = setTimeout(() => { if (!cancelled) { timedOut = true; setStatus("error"); } }, 12000);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(async (stream) => {
      clearTimeout(timer); if (cancelled || timedOut) return stream.getTracks().forEach((track) => track.stop());
      const track = stream.getVideoTracks()[0];
      if (track?.getCapabilities && track?.applyConstraints) {
        const capabilities = track.getCapabilities(); const advanced = {};
        if (capabilities.focusMode?.includes?.("continuous")) advanced.focusMode = "continuous";
        if (capabilities.exposureMode?.includes?.("continuous")) advanced.exposureMode = "continuous";
        if (capabilities.whiteBalanceMode?.includes?.("continuous")) advanced.whiteBalanceMode = "continuous";
        if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced] }).catch(() => undefined);
      }
      streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); } setStatus("ready");
    }).catch((error) => { clearTimeout(timer); if (cancelled) return; if (["NotAllowedError", "SecurityError"].includes(error?.name)) setStatus("denied"); else if (["NotFoundError", "OverconstrainedError"].includes(error?.name)) setStatus("missing"); else setStatus("error"); });
    return () => { cancelled = true; clearTimeout(timer); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  }, [active, attempt]);

  const captureBest = useCallback(async (landmarks) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) throw new Error("Camera did not produce a usable palm image.");
    if (!scratchRef.current) { scratchRef.current = document.createElement("canvas"); scratchRef.current.width = MEASURE_W; scratchRef.current.height = MEASURE_H; }
    if (!fullRef.current) fullRef.current = document.createElement("canvas");
    const region = handRegion(landmarks, video.videoWidth, video.videoHeight);
    const frames = [];
    for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
      const canvas = fullRef.current; canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (blob) frames.push({ blob, sharpness: measureSharpness(video, scratchRef.current, region), bytes: blob.size });
      if (frameIndex < 2) await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!frames.length) throw new Error("Camera did not produce a usable palm image.");
    const largest = Math.max(...frames.map((frame) => frame.bytes));
    const usable = frames.filter((frame) => frame.bytes > largest * .4);
    const best = (usable.length ? usable : frames).reduce((sharpest, frame) => frame.sharpness > sharpest.sharpness ? frame : sharpest);
    console.info("[palm capture]", { frame: `${video.videoWidth}x${video.videoHeight}`, hand: region ? `${Math.round(region.width)}x${Math.round(region.height)}` : "unknown", bytes: best.bytes, handSharpness: Math.round(best.sharpness) });
    return best.blob;
  }, []);
  return { videoRef, status, retry: () => setAttempt((value) => value + 1), captureBest };
}

export function usePalmDetection(videoRef, active) {
  const [state, setState] = useState("loading"); const [landmarks, setLandmarks] = useState([]);
  useEffect(() => {
    if (!active) { setState("paused"); setLandmarks([]); return undefined; }
    setState("loading");
    let stopped = false; let landmarker; let timer; let previous = null; let stableCount = 0;
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const sample = () => {
      const video = videoRef.current; if (!video || !landmarker || video.readyState < 2 || !video.videoWidth) return;
      let hands;
      try { hands = landmarker.detectForVideo(video, performance.now()).landmarks; }
      catch { setState("error"); return; }
      const hand = hands[0];
      if (hands.length !== 1 || !hand || hand.length !== 21) { stableCount = 0; previous = null; setLandmarks([]); setState("place"); return; }
      setLandmarks(hand);
      const xs = hand.map((point) => point.x); const ys = hand.map((point) => point.y); const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys); const width = maxX - minX; const height = maxY - minY;
      const centred = (minX + maxX) / 2 > .3 && (minX + maxX) / 2 < .7; const full = minX > .035 && maxX < .965 && minY > .035 && maxY < .965; const sized = width > .42 && width < .88 && height > .58 && height < .95;
      if (!centred || !full || !sized) { stableCount = 0; previous = hand; setState("position"); return; }
      const wrist = hand[0]; const fingers = [[4,2,1.15],[8,6,1.12],[12,10,1.12],[16,14,1.1],[20,18,1.08]];
      if (!fingers.every(([tip, joint, ratio]) => distance(wrist, hand[tip]) > distance(wrist, hand[joint]) * ratio)) { stableCount = 0; previous = hand; setState("open"); return; }
      const motion = previous ? hand.reduce((total, point, index) => total + distance(point, previous[index]), 0) / hand.length : Infinity; previous = hand; stableCount = motion < STABLE_DELTA ? stableCount + 1 : 0; setState(stableCount >= STABLE_FRAMES ? "ready" : "moving");
    };
    loadLandmarker().then((instance) => { if (stopped) return; landmarker = instance; setState("place"); timer = setInterval(sample, SAMPLE_MS); }).catch(() => !stopped && setState("error"));
    return () => { stopped = true; if (timer) clearInterval(timer); };
  }, [active, videoRef]);
  return { state, landmarks };
}
