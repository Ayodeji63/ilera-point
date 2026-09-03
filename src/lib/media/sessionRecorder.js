function supportedMime(kind) {
  const choices = kind === "video" ? ["video/webm;codecs=vp8,opus", "video/webm"] : ["audio/webm;codecs=opus", "audio/webm"];
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function recorderOptions(kind) {
  const mimeType = supportedMime(kind);
  return { ...(mimeType ? { mimeType } : {}), ...(kind === "video" ? { videoBitsPerSecond: 650000, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 }) };
}

export class SessionRecorder {
  stream = null;
  sessionRecorder = null;
  turnRecorder = null;
  sessionChunks = [];
  consented = false;

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

  stopTurn() { if (this.turnRecorder?.state === "recording") this.turnRecorder.stop(); }

  async finish() {
    let video = null;
    if (this.sessionRecorder?.state === "recording") {
      video = await new Promise((resolve) => {
        this.sessionRecorder.onstop = () => resolve(new Blob(this.sessionChunks, { type: this.sessionRecorder.mimeType || "video/webm" }));
        this.sessionRecorder.stop();
      });
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    return video;
  }

  destroy() { this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null; }
}
