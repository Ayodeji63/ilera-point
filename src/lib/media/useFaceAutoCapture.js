import { useCallback, useEffect, useRef, useState } from "react";

const MEASURE_W = 256;
const MEASURE_H = 144;
const JPEG_QUALITY = .9;
const SAMPLE_MS = 400;
const STABLE_DELTA = 0.012;
const STABLE_FRAMES = 4;
const WASM_ROOT = "/mediapipe/wasm";
const FACE_MODEL = "/mediapipe/models/blaze_face_short_range.tflite";

let detectorPromise;
function loadDetector() {
  if (!detectorPromise) detectorPromise = (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: .6,
    });
  })().catch((error) => { detectorPromise = null; throw error; });
  return detectorPromise;
}

export function preloadFaceRecognition() { void loadDetector().catch(() => undefined); }

// MediaPipe reports the face box in source-frame pixels already. Pad it a little
// so the crop keeps hairline and chin, which the matcher relies on.
export function faceRegion(box, videoWidth, videoHeight) {
  if (!box || !Number.isFinite(box.originX) || !Number.isFinite(box.width) || box.width <= 0 || box.height <= 0) return null;
  const padX = box.width * .18;
  const padY = box.height * .18;
  const left = Math.max(0, box.originX - padX);
  const top = Math.max(0, box.originY - padY);
  const right = Math.min(videoWidth, box.originX + box.width + padX);
  const bottom = Math.min(videoHeight, box.originY + box.height + padY);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// Framing rules for a kiosk at arm's length: one face, centred, filling enough
// of the frame to carry detail, and fully inside it.
export function faceFraming(box, videoWidth, videoHeight) {
  if (!box) return "place";
  const centreX = (box.originX + box.width / 2) / videoWidth;
  const centreY = (box.originY + box.height / 2) / videoHeight;
  const widthRatio = box.width / videoWidth;
  if (box.originX < 0 || box.originY < 0 || box.originX + box.width > videoWidth || box.originY + box.height > videoHeight) return "position";
  if (centreX < .3 || centreX > .7 || centreY < .25 || centreY > .78) return "position";
  if (widthRatio < .22) return "closer";
  if (widthRatio > .72) return "further";
  return "framed";
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

export function useFaceCamera(active = true) {
  const videoRef = useRef(null); const streamRef = useRef(null); const scratchRef = useRef(null); const fullRef = useRef(null);
  const [status, setStatus] = useState("starting"); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false; let timedOut = false; setStatus("starting");
    const timer = setTimeout(() => { if (!cancelled) { timedOut = true; setStatus("error"); } }, 12000);
    // Front camera: the patient looks at the screen they are being guided by.
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(async (stream) => {
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

  const captureBest = useCallback(async (box) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) throw new Error("Camera did not produce a usable photograph.");
    if (!scratchRef.current) { scratchRef.current = document.createElement("canvas"); scratchRef.current.width = MEASURE_W; scratchRef.current.height = MEASURE_H; }
    if (!fullRef.current) fullRef.current = document.createElement("canvas");
    const region = faceRegion(box, video.videoWidth, video.videoHeight);
    const frames = [];
    for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
      const canvas = fullRef.current; canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (blob) frames.push({ blob, sharpness: measureSharpness(video, scratchRef.current, region), bytes: blob.size });
      if (frameIndex < 2) await new Promise((resolve) => setTimeout(resolve, 180));
    }
    if (!frames.length) throw new Error("Camera did not produce a usable photograph.");
    const largest = Math.max(...frames.map((frame) => frame.bytes));
    const usable = frames.filter((frame) => frame.bytes > largest * .4);
    const best = (usable.length ? usable : frames).reduce((sharpest, frame) => frame.sharpness > sharpest.sharpness ? frame : sharpest);
    console.info("[face capture]", { frame: `${video.videoWidth}x${video.videoHeight}`, face: region ? `${Math.round(region.width)}x${Math.round(region.height)}` : "unknown", bytes: best.bytes, sharpness: Math.round(best.sharpness) });
    return best.blob;
  }, []);
  return { videoRef, status, retry: () => setAttempt((value) => value + 1), captureBest };
}

export function useFaceDetection(videoRef, active) {
  const [state, setState] = useState("loading"); const [box, setBox] = useState(null);
  useEffect(() => {
    if (!active) { setState("paused"); setBox(null); return undefined; }
    setState("loading");
    let stopped = false; let detector; let timer; let previous = null; let stableCount = 0;
    const sample = () => {
      const video = videoRef.current; if (!video || !detector || video.readyState < 2 || !video.videoWidth) return;
      let detections;
      try { detections = detector.detectForVideo(video, performance.now()).detections; }
      catch { setState("error"); return; }
      // More than one face in frame is refused outright: the kiosk must never
      // guess which person it is about to identify.
      if (detections.length > 1) { stableCount = 0; previous = null; setBox(null); setState("crowded"); return; }
      const current = detections[0]?.boundingBox;
      if (!current) { stableCount = 0; previous = null; setBox(null); setState("place"); return; }
      setBox(current);
      const framing = faceFraming(current, video.videoWidth, video.videoHeight);
      if (framing !== "framed") { stableCount = 0; previous = current; setState(framing); return; }
      const motion = previous
        ? (Math.abs(current.originX - previous.originX) + Math.abs(current.originY - previous.originY)) / video.videoWidth
        : Infinity;
      previous = current;
      stableCount = motion < STABLE_DELTA ? stableCount + 1 : 0;
      setState(stableCount >= STABLE_FRAMES ? "ready" : "moving");
    };
    loadDetector().then((instance) => { if (stopped) return; detector = instance; setState("place"); timer = setInterval(sample, SAMPLE_MS); }).catch(() => !stopped && setState("error"));
    return () => { stopped = true; if (timer) clearInterval(timer); };
  }, [active, videoRef]);
  return { state, box };
}
