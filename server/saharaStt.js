import WebSocket, { WebSocketServer } from "ws";
import { repairUtf8Mojibake } from "./textEncoding.js";

const SAHARA_STT_STREAM_URL = "wss://infer.voice.intron.io/stt/v1/stream";
// Sahara accepts 1KB to 32KB of PCM per message. Batch at 16KB, then pad only
// the final sub-1KB tail with a few milliseconds of silence before COMMIT.
const MIN_UPSTREAM_CHUNK = 1024;
const TARGET_UPSTREAM_CHUNK = 16384;
const MAX_UPSTREAM_CHUNK = 32768;
const SESSION_TIMEOUT_MS = 5000;
// Sahara returns a committed transcript in six to eight seconds. Past twelve,
// the kiosk is better off retrying through the file upload route.
const COMMIT_TIMEOUT_MS = 12000;
const LANGUAGE_CAPACITY_DEFAULT_MS = 30000;
const languageCapacityBlockedUntil = new Map();

export function languageCapacityDelayMs(message, fallbackMs = LANGUAGE_CAPACITY_DEFAULT_MS) {
  if (!/required language not available|language.*not available/i.test(String(message || ""))) return 0;
  const seconds = Number(String(message).match(/wait\s+(\d+)\s*seconds?/i)?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs;
}

export function noteLanguageCapacityFailure(languageCode, message, now = Date.now()) {
  const delay = languageCapacityDelayMs(message);
  if (!delay) return 0;
  languageCapacityBlockedUntil.set(languageCode, Math.max(languageCapacityBlockedUntil.get(languageCode) || 0, now + delay));
  return delay;
}

export function languageCapacityCooldownMs(languageCode, now = Date.now()) {
  const remaining = Math.max(0, (languageCapacityBlockedUntil.get(languageCode) || 0) - now);
  if (!remaining) languageCapacityBlockedUntil.delete(languageCode);
  return remaining;
}

export function resetLanguageCapacityCooldowns() {
  languageCapacityBlockedUntil.clear();
}

export function saharaSttUrl({ languageCode, sampleRate }) {
  const params = new URLSearchParams({
    sample_rate: String(sampleRate),
    bit_rate: "16",
    num_channels: "1",
    use_language_asr_input: languageCode,
  });
  return `${SAHARA_STT_STREAM_URL}?${params}`;
}

export function validateStreamRequest({ languageCode, sampleRate, supportedLanguages }) {
  if (!supportedLanguages.has(languageCode)) return `Unsupported language code: ${languageCode}.`;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) return "Unsupported audio sample rate.";
  return null;
}

// Splits a growing PCM buffer into upstream-sized pieces, keeping the remainder
// for the next call so no message falls under Sahara's minimum.
export function drainChunks(buffer, { flush = false } = {}) {
  const chunks = [];
  let rest = buffer;
  while (rest.length >= TARGET_UPSTREAM_CHUNK) {
    const size = Math.min(TARGET_UPSTREAM_CHUNK, MAX_UPSTREAM_CHUNK);
    chunks.push(rest.subarray(0, size));
    rest = rest.subarray(size);
  }
  if (flush && rest.length) {
    if (rest.length < MIN_UPSTREAM_CHUNK) {
      const padded = Buffer.alloc(MIN_UPSTREAM_CHUNK);
      rest.copy(padded);
      chunks.push(padded);
    } else chunks.push(rest);
    rest = rest.subarray(rest.length);
  }
  return { chunks, rest };
}

export function attachSpeechStream(server, { apiKey, supportedLanguages }) {
  const sockets = new WebSocketServer({ server, path: "/api/speech/stream" });

  sockets.on("connection", (client, request) => {
    const params = new URL(request.url, "http://localhost").searchParams;
    const languageCode = params.get("languageCode") || "";
    const sampleRate = Number(params.get("sampleRate"));
    const tell = (payload) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload)); };
    const invalid = apiKey ? validateStreamRequest({ languageCode, sampleRate, supportedLanguages }) : "SAHARA_API_KEY is not configured.";
    if (invalid) {
      tell({ type: "error", message: invalid });
      client.close();
      return;
    }

    const capacityCooldown = languageCapacityCooldownMs(languageCode);
    if (capacityCooldown) {
      // Sahara explicitly asked clients to wait. Do not open another upstream
      // socket that is guaranteed to fail; make the browser use its already
      // recorded file immediately for this turn.
      tell({ type: "error", message: `Live transcription is cooling down for ${Math.ceil(capacityCooldown / 1000)} seconds; using the recording upload.` });
      client.close();
      return;
    }

    const startedAt = performance.now();
    const upstream = new WebSocket(saharaSttUrl({ languageCode, sampleRate }), {
      headers: { Authorization: `Bearer ${apiKey}` },
      perMessageDeflate: false,
      handshakeTimeout: 10000,
    });
    let pending = Buffer.alloc(0);
    let ackId = 1;
    let ready = false;
    let committed = false;
    let commitRequested = false;
    let terminal = false;
    let commitTimer = null;
    let sessionTimer = setTimeout(() => fail("Sahara did not create a transcription session in time."), SESSION_TIMEOUT_MS);

    const send = (chunk) => upstream.send(JSON.stringify({ message_type: "INPUT_AUDIO_CHUNK", audio_base_64: chunk.toString("base64"), ack_id: ackId++ }));
    const drain = (flush) => {
      const result = drainChunks(pending, { flush });
      pending = Buffer.from(result.rest);
      for (const chunk of result.chunks) send(chunk);
    };
    const stop = () => {
      clearTimeout(commitTimer);
      clearTimeout(sessionTimer);
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
      else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
      if (client.readyState === WebSocket.OPEN) client.close();
    };
    const fail = (message) => {
      if (terminal) return;
      terminal = true;
      noteLanguageCapacityFailure(languageCode, message);
      // The kiosk keeps the recorded audio, so a failure here just sends it back
      // to the file upload route rather than losing the patient's answer.
      console.warn("[Sahara STT] live transcription failed; kiosk falls back to file upload", { languageCode, message });
      tell({ type: "error", message });
      stop();
    };

    const commit = () => {
      if (!commitRequested || committed || !ready || upstream.readyState !== WebSocket.OPEN) return;
      committed = true;
      drain(true);
      upstream.send(JSON.stringify({ message_type: "COMMIT" }));
      commitTimer = setTimeout(() => fail("Sahara did not return a transcript in time."), COMMIT_TIMEOUT_MS);
    };

    upstream.on("message", (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.message_type === "SESSION_CREATED") {
        clearTimeout(sessionTimer);
        sessionTimer = null;
        ready = true;
        drain(false);
        commit();
      } else if (message.message_type === "PARTIAL_TRANSCRIPT") tell({ type: "partial", transcript: repairUtf8Mojibake(message.transcript || "") });
      else if (message.message_type === "COMMITTED_TRANSCRIPT") {
        clearTimeout(commitTimer);
        terminal = true;
        console.info("[latency] transcription", { durationMs: Math.round(performance.now() - startedAt), languageCode, mode: "stream" });
        tell({ type: "final", transcript: repairUtf8Mojibake(message.transcript_text || "").trim() });
        stop();
      } else if (/ERROR|EXCEED|EXHAUST|LIMIT|QUOTA|TOO_SMALL|TOO_LARGE|MISMATCH|INSUFFICIENT/i.test(message.message_type || "")) {
        fail(message.message || `Sahara transcription error: ${message.message_type}`);
      }
    });
    upstream.on("error", (error) => fail(error.message || "The transcription connection failed."));
    upstream.on("close", () => { if (!terminal) fail("The transcription connection closed early."); });

    client.on("message", (raw, isBinary) => {
      if (isBinary) {
        pending = Buffer.concat([pending, raw]);
        if (ready) drain(false);
        return;
      }
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type !== "commit" || commitRequested) return;
      commitRequested = true;
      commit();
    });
    client.on("close", stop);
    client.on("error", stop);
  });

  return sockets;
}
