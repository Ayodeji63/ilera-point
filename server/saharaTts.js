import WebSocket from "ws";
import { mergeWavBuffers } from "./wav.js";

const SAHARA_TTS_STREAM_URL = "wss://infer.voice.intron.io/tts/v1/stream";
const TERMINAL_TYPES = new Set([
  "ERROR", "INPUT_ERROR", "AUTHENTICATION_ERROR", "RESOURCE_EXHAUSTED",
  "QUOTA_EXCEEDED", "SESSION_TIME_LIMIT_EXCEEDED", "INSUFFICIENT_TEXT_ACTIVITY",
  "CHUNK_ID_MISMATCH_WITH_TOTAL", "CHUNCK_SIZE_TOO_SMALL", "CHUNK_SIZE_TOO_LARGE",
]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function saharaSocketOptions(apiKey) {
  return {
    headers: { Authorization: `Bearer ${apiKey}` },
    // Sahara emits malformed fragmented frames when compression is negotiated.
    perMessageDeflate: false,
    handshakeTimeout: 10000,
  };
}

export function saharaSocketUrl({ voiceAccent, voiceGender, language }) {
  const params = new URLSearchParams({
    voice_accent: voiceAccent,
    voice_gender: voiceGender,
    voice_language: language,
    output_audio_format: "wav",
  });
  return `${SAHARA_TTS_STREAM_URL}?${params}`;
}

function createMessageQueue(ws) {
  const queued = [];
  const waiting = [];
  let terminalError = null;
  const fail = (error) => {
    terminalError = error instanceof Error ? error : new Error(String(error || "Sahara TTS session failed"));
    while (waiting.length) {
      const entry = waiting.shift();
      clearTimeout(entry.timer);
      entry.reject(terminalError);
    }
  };
  ws.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch { fail(new Error("Sahara TTS returned an unreadable response.")); return; }
    if (TERMINAL_TYPES.has(message.message_type)) {
      fail(new Error(message.message || message.status || `Sahara TTS error: ${message.message_type}`));
      return;
    }
    const match = waiting.findIndex(({ predicate }) => predicate(message));
    if (match >= 0) waiting.splice(match, 1)[0].resolve(message);
    else queued.push(message);
  });
  ws.on("error", fail);
  ws.on("close", (code, reason) => {
    if (code !== 1000 && waiting.length) fail(new Error(reason.toString() || `Sahara TTS connection closed (${code}).`));
  });
  return (predicate, timeout = 15000) => {
    if (terminalError) return Promise.reject(terminalError);
    const match = queued.findIndex(predicate);
    if (match >= 0) return Promise.resolve(queued.splice(match, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = { predicate, reject, resolve: (value) => { clearTimeout(entry.timer); resolve(value); } };
      entry.timer = setTimeout(() => {
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        reject(new Error("Sahara speech session timed out."));
      }, timeout);
      waiting.push(entry);
    });
  };
}

export async function synthesizeWithSahara({ chunks, pausesMs = [], voiceAccent, voiceGender, language, apiKey, signal, readyTimeoutMs = 14000, returnChunks = false }) {
  const ws = new WebSocket(saharaSocketUrl({ voiceAccent, voiceGender, language }), saharaSocketOptions(apiKey));
  const abort = () => ws.terminate();
  signal?.addEventListener("abort", abort, { once: true });
  const nextMessage = createMessageQueue(ws);
  try {
    await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    await nextMessage((message) => message.message_type === "SESSION_CREATED", 10000);

    // Submit every chunk first so Sahara can synthesize them concurrently.
    for (let index = 0; index < chunks.length; index += 1) {
      const id = index + 1;
      ws.send(JSON.stringify({ message_type: "INPUT_TEXT_CHUNK", text: chunks[index], ack_id: id }));
      await nextMessage((message) => message.message_type === "TEXT_CHUNK_ACK" && (message.ack_id === id || message.chunck_id === id || message.chunk_id === id));
    }

    const audioBuffers = new Array(chunks.length);
    const pending = new Set(chunks.map((_, index) => index + 1));
    const readyDeadline = Date.now() + readyTimeoutMs;
    while (pending.size && Date.now() < readyDeadline) {
      const requested = [...pending];
      for (const id of requested) ws.send(JSON.stringify({ message_type: "FETCH_AUDIO_CHUNK", chunk_id: id }));
      for (const id of requested) {
        const remaining = Math.max(1000, readyDeadline - Date.now());
        let message;
        try {
          message = await nextMessage((item) => item.message_type === "FETCH_AUDIO_CHUNK" && item.chunk_id === id, Math.min(5000, remaining));
        } catch (error) {
          // A missed fetch response is not a failed generation. Sahara can still
          // be processing the chunk, so poll it again until the session deadline.
          if (/speech session timed out/i.test(error.message)) continue;
          throw error;
        }
        const status = message.processing_status || message.processing_staus;
        if (status === "READY" && message.audio_base_64) {
          audioBuffers[id - 1] = Buffer.from(message.audio_base_64, "base64");
          pending.delete(id);
        }
      }
      if (pending.size) await wait(350);
    }
    if (pending.size) throw new Error(`Sahara speech generation took longer than ${Math.round(readyTimeoutMs / 1000)} seconds.`);

    // Audio is ready. Flush COMMIT and immediately close the session; waiting for
    // COMMITTED_AUDIO kept old sessions open long enough to block the next turn.
    ws.send(JSON.stringify({ message_type: "COMMIT" }));
    ws.close();
    return returnChunks ? audioBuffers : mergeWavBuffers(audioBuffers, pausesMs);
  } catch (error) {
    if (ws.readyState === WebSocket.OPEN) ws.close();
    else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
    throw new Error(error?.message || "Sahara TTS connection failed.");
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
