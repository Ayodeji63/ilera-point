// The recorder's MediaRecorder output cannot be transcribed until the patient
// stops talking. This taps the same microphone as raw PCM so Sahara can
// transcribe while they are still speaking.
const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) this.port.postMessage(new Float32Array(channel));
    return true;
  }
}
registerProcessor("pcm-tap", PcmTap);
`;

export function toPcm16(samples) {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = Math.round(clamped * (clamped < 0 ? 0x8000 : 0x7fff));
  }
  return pcm;
}

export function speechStreamUrl(languageCode, sampleRate, location = window.location) {
  // Vercel rewrites proxy HTTP fine but cannot tunnel a WebSocket upgrade to
  // an external origin. In production, connect directly to the Render API for
  // this endpoint while preserving the same-origin fallback for local work.
  const wsOrigin = import.meta.env.VITE_SPEECH_WS_ORIGIN?.trim();
  const sameOrigin = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const base = (wsOrigin || sameOrigin).replace(/\/+$/, "");
  return `${base}/api/speech/stream?languageCode=${encodeURIComponent(languageCode)}&sampleRate=${Math.round(sampleRate)}`;
}

export class TurnTranscriber {
  socket = null;
  worklet = null;
  partial = "";
  // Audio captured before the socket finishes opening, so a patient who answers
  // immediately does not lose their first words.
  #buffered = [];
  #settle = null;
  #result = null;

  constructor(languageCode) {
    this.languageCode = languageCode;
  }

  static supported(context) {
    return Boolean(globalThis.WebSocket && globalThis.AudioWorkletNode && context?.audioWorklet);
  }

  async open(sampleRate) {
    this.#result = new Promise((resolve, reject) => { this.#settle = { resolve, reject }; });
    // Nothing awaits the result until commit(); keep it from becoming an
    // unhandled rejection if the socket fails first.
    this.#result.catch(() => {});
    const socket = new WebSocket(speechStreamUrl(this.languageCode, sampleRate));
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "partial") this.partial = message.transcript;
      else if (message.type === "final") this.#settle.resolve(message.transcript);
      else if (message.type === "error") this.#settle.reject(new Error(message.message));
    });
    socket.addEventListener("error", () => this.#settle.reject(new Error("The live transcription connection failed.")));
    socket.addEventListener("close", () => this.#settle.reject(new Error("The live transcription connection closed.")));
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", () => {
        for (const chunk of this.#buffered) socket.send(chunk);
        this.#buffered = [];
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => reject(new Error("Live transcription is unavailable.")), { once: true });
    });
  }

  async attach(context, source) {
    await context.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" })));
    this.worklet = new AudioWorkletNode(context, "pcm-tap");
    this.worklet.port.onmessage = (event) => {
      const pcm = toPcm16(event.data).buffer;
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(pcm);
      // Cap the pre-connection buffer so a socket that never opens cannot grow
      // without bound: roughly ten seconds of 48kHz audio.
      else if (this.socket && this.#buffered.length < 4000) this.#buffered.push(pcm);
    };
    source.connect(this.worklet);
  }

  async commit() {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("Live transcription is unavailable.");
    this.socket.send(JSON.stringify({ type: "commit" }));
    try {
      return await this.#result;
    } finally {
      this.close();
    }
  }

  close() {
    try { this.worklet?.disconnect(); } catch {}
    this.worklet = null;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
    this.socket = null;
  }
}
