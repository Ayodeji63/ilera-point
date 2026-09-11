function supportedMime(kind) {
  const choices = kind === "video" ? ["video/webm;codecs=vp8,opus", "video/webm"] : ["audio/webm;codecs=opus", "audio/webm"];
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function recorderOptions(kind) {
  const mimeType = supportedMime(kind);
  return { ...(mimeType ? { mimeType } : {}), ...(kind === "video" ? { videoBitsPerSecond: 650000, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 }) };
}

export function audioRms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) {
    const normalized = sample / 128 - 1;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}

export function voiceThreshold(noiseFloor) {
  return Math.min(0.12, Math.max(0.012, noiseFloor * 2.8));
}

export function calibratedNoiseFloor(levels) {
  if (!levels.length) return 0;
  const ordered = [...levels].sort((left, right) => left - right);
  return ordered[Math.floor((ordered.length - 1) * 0.25)];
}

export class SessionRecorder {
  stream = null;
  sessionRecorder = null;
  turnRecorder = null;
  sessionChunks = [];
  consented = false;
  vadCleanup = null;

  async start(videoConsent) {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error("Camera and microphone recording are not supported in this browser.");
    this.consented = videoConsent;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: videoConsent ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user", frameRate: { ideal: 20, max: 24 } } : false,
    });
    if (videoConsent) {
      this.sessionChunks = [];
      this.sessionRecorder = new MediaRecorder(this.stream, recorderOptions("video"));
      this.sessionRecorder.ondataavailable = (event) => event.data.size && this.sessionChunks.push(event.data);
      this.sessionRecorder.start(1000);
    }
    return this.stream;
  }

  recordTurn() {
    if (!this.stream) throw new Error("The microphone is not ready. Return to consent and try again.");
    const chunks = [];
    const audioStream = new MediaStream(this.stream.getAudioTracks());
    this.turnRecorder = new MediaRecorder(audioStream, recorderOptions("audio"));
    this.turnRecorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    this.turnRecorder.start();
    return new Promise((resolve, reject) => {
      this.turnRecorder.onerror = () => reject(new Error("Audio recording failed. Please type your answer."));
      this.turnRecorder.onstop = () => resolve(new Blob(chunks, { type: this.turnRecorder.mimeType || "audio/webm" }));
    });
  }

  recordTurnUntilSilence({ silenceMs = 2600, waitForSpeechMs = 18000, maxDurationMs = 60000, onState = () => {}, onAudio = null } = {}) {
    const finished = this.recordTurn();
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      const timer = setTimeout(() => this.stopTurn(), maxDurationMs);
      return finished.finally(() => clearTimeout(timer));
    }

    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(new MediaStream(this.stream.getAudioTracks()));
    // Live transcription taps this same graph rather than opening a second
    // microphone context alongside the silence detector.
    onAudio?.(context, source);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    const calibration = [];
    let threshold = 0.018;
    let speechStarted = false;
    let loudSamples = 0;
    let lastSpeechAt = 0;
    onState("waiting");

    const cleanup = () => {
      clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      context.close().catch(() => {});
      if (this.vadCleanup === cleanup) this.vadCleanup = null;
    };
    this.vadCleanup = cleanup;

    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - startedAt;
      analyser.getByteTimeDomainData(samples);
      const level = audioRms(samples);

      if (elapsed < 300) {
        calibration.push(level);
        return;
      }
      if (calibration.length) {
        threshold = voiceThreshold(calibratedNoiseFloor(calibration));
        calibration.length = 0;
      }

      if (level >= threshold) {
        loudSamples += 1;
        if (loudSamples >= 4) {
          if (!speechStarted) onState("speaking");
          speechStarted = true;
          lastSpeechAt = now;
        }
      } else {
        loudSamples = 0;
      }

      // A long silence is required to finish so natural thinking pauses do not cut the answer off.
      if (speechStarted && now - lastSpeechAt >= silenceMs) {
        onState("finishing");
        this.stopTurn();
      } else if ((!speechStarted && elapsed >= waitForSpeechMs) || elapsed >= maxDurationMs) {
        this.stopTurn();
      }
    }, 50);

    return finished.then((blob) => {
      if (!speechStarted) throw new Error("I did not hear an answer. Speak a little closer to the microphone or type below.");
      return blob;
    }).finally(cleanup);
  }

  stopTurn() { if (this.turnRecorder?.state === "recording") this.turnRecorder.stop(); }

  async finish() {
    let video = null;
    if (this.sessionRecorder?.state === "recording") {
      video = await new Promise((resolve) => {
        this.sessionRecorder.onstop = () => resolve(new Blob(this.sessionChunks, { type: "video/webm" }));
        this.sessionRecorder.stop();
      });
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    return video;
  }

  destroy() {
    this.vadCleanup?.();
    this.stopTurn();
    if (this.sessionRecorder?.state === "recording") this.sessionRecorder.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
