import WebSocket, { WebSocketServer } from "ws";

const SAHARA_STT_STREAM_URL = "wss://infer.voice.intron.io/stt/v1/stream";
// Sahara accepts 1KB to 32KB of PCM per message. Batching to 16KB keeps the
// message count low without ever crossing the ceiling.
const MIN_UPSTREAM_CHUNK = 16384;
const MAX_UPSTREAM_CHUNK = 32768;
// Sahara returns a committed transcript in six to eight seconds. Past twelve,
// the kiosk is better off retrying through the file upload route.
const COMMIT_TIMEOUT_MS = 12000;

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
  while (rest.length >= MIN_UPSTREAM_CHUNK) {
    chunks.push(rest.subarray(0, MAX_UPSTREAM_CHUNK));
    rest = rest.subarray(MAX_UPSTREAM_CHUNK);
  }
  if (flush && rest.length) {
    chunks.push(rest);
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
    let commitTimer = null;

    const send = (chunk) => upstream.send(JSON.stringify({ message_type: "INPUT_AUDIO_CHUNK", audio_base_64: chunk.toString("base64"), ack_id: ackId++ }));
    const drain = (flush) => {
      const result = drainChunks(pending, { flush });
      pending = Buffer.from(result.rest);
      for (const chunk of result.chunks) send(chunk);
    };
    const stop = () => {
      clearTimeout(commitTimer);
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
      else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
      if (client.readyState === WebSocket.OPEN) client.close();
    };
    const fail = (message) => {
      // The kiosk keeps the recorded audio, so a failure here just sends it back
      // to the file upload route rather than losing the patient's answer.
      console.warn("[Sahara STT] live transcription failed; kiosk falls back to file upload", { languageCode, message });
      tell({ type: "error", message });
      stop();
    };

    upstream.on("open", () => { ready = true; drain(false); });
    upstream.on("message", (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.message_type === "PARTIAL_TRANSCRIPT") tell({ type: "partial", transcript: message.transcript || "" });
      else if (message.message_type === "COMMITTED_TRANSCRIPT") {
        clearTimeout(commitTimer);
        console.info("[latency] transcription", { durationMs: Math.round(performance.now() - startedAt), languageCode, mode: "stream" });
        tell({ type: "final", transcript: (message.transcript_text || "").trim() });
        stop();
      } else if (/ERROR|EXCEED|EXHAUST|LIMIT/i.test(message.message_type || "")) {
        fail(message.message || `Sahara transcription error: ${message.message_type}`);
      }
    });
    upstream.on("error", (error) => fail(error.message || "The transcription connection failed."));
    upstream.on("close", () => { if (!committed) fail("The transcription connection closed early."); });

    client.on("message", (raw, isBinary) => {
      if (isBinary) {
        pending = Buffer.concat([pending, raw]);
        if (ready) drain(false);
        return;
      }
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type !== "commit" || committed) return;
      committed = true;
      if (!ready) { fail("The transcription connection was not ready."); return; }
      drain(true);
      upstream.send(JSON.stringify({ message_type: "COMMIT" }));
      commitTimer = setTimeout(() => fail("Sahara did not return a transcript in time."), COMMIT_TIMEOUT_MS);
    });
    client.on("close", stop);
    client.on("error", stop);
  });

  return sockets;
}
