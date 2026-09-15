import WebSocket from "ws";
import { mergeWavBuffers } from "./wav.js";
import { hasStreamSlot, noteStreamRateLimited, reserveStreamSlot, streamBudgetDelaySeconds, streamConnectionLimit } from "./saharaStreamBudget.js";

const SAHARA_TTS_STREAM_URL = "wss://infer.voice.intron.io/tts/v1/stream";
const DEFAULT_POOL_SIZE = 1;
const WARM_SESSION_IDLE_MS = 30000;
const TERMINAL_TYPES = new Set([
  "ERROR", "INPUT_ERROR", "AUTHENTICATION_ERROR", "RESOURCE_EXHAUSTED",
  "QUOTA_EXCEEDED", "SESSION_TIME_LIMIT_EXCEEDED", "INSUFFICIENT_TEXT_ACTIVITY",
  "CHUNK_ID_MISMATCH_WITH_TOTAL", "CHUNCK_SIZE_TOO_SMALL", "CHUNK_SIZE_TOO_LARGE",
]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function downloadAudio(audioPath, signal) {
  const audioUrl = normalizeSaharaAudioUrl(audioPath);
  const response = await fetch(audioUrl, { signal });
  if (!response.ok) throw new Error("Sahara generated speech but the audio could not be downloaded.");
  return Buffer.from(await response.arrayBuffer());
}

function textId(body) {
  return body?.data?.text_id || body?.data?.textId || body?.text_id || null;
}

function generatedAudioPath(body) {
  return body?.data?.audio_path || body?.data?.audioPath || null;
}

function processingStatus(body) {
  return String(body?.data?.processing_status || body?.data?.status || "").toUpperCase();
}

async function waitForQueuedSpeech(id, { apiKey, signal, timeoutMs = 20000 }) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    await wait(Math.min(1000, 300 + attempt * 100));
    const response = await fetch(`https://infer.voice.intron.io/tts/v1/status/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) {
      const retryAfter = Math.max(1, Number(response.headers.get("retry-after")) || 1);
      await wait(Math.min(retryAfter * 1000, 3000));
      attempt += 1;
      continue;
    }
    if (!response.ok) throw new Error(body.message || "Could not check Sahara speech status.");
    const audioPath = generatedAudioPath(body);
    const status = processingStatus(body);
    if (audioPath && (!status || status.includes("GENERATED"))) return downloadAudio(audioPath, signal);
    if (status.includes("FAILED")) throw new Error(body.message || "Sahara speech generation failed.");
    attempt += 1;
  }
  throw new Error(`Sahara speech generation took longer than ${Math.round(timeoutMs / 1000)} seconds.`);
}

export function saharaSocketOptions(apiKey) {
  return {
    headers: { Authorization: `Bearer ${apiKey}` },
    // Nothing to gain from compressing JSON control frames, and offering it only
    // widens the set of frames Sahara can send us.
    perMessageDeflate: false,
    handshakeTimeout: 10000,
  };
}

// Sahara answers a rate-limited stream upgrade with a raw HTTP 429 written onto
// the already-upgraded socket, so `ws` reports it as a malformed frame rather
// than as a close code. See saharaStreamBudget.js for the captured response.
const RATE_LIMITED_FRAME = /invalid websocket frame/i;

export function streamLimitError() {
  const delay = streamBudgetDelaySeconds();
  const retryHint = delay ? ` Retry in about ${delay} seconds.` : "";
  return new Error(`Sahara stream connection limit reached (${streamConnectionLimit()} per minute).${retryHint}`);
}

export function describeSessionFailure(error) {
  const message = error?.message || "";
  if (!RATE_LIMITED_FRAME.test(message)) return error instanceof Error ? error : new Error(message || "Sahara TTS session failed.");
  noteStreamRateLimited();
  return streamLimitError();
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

function createMessageQueue(ws, onFailure = () => {}) {
  const queued = [];
  const waiting = [];
  let terminalError = null;
  const fail = (error) => {
    terminalError = error instanceof Error ? error : new Error(String(error || "Sahara TTS session failed"));
    onFailure(terminalError);
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
    fail(new Error(reason.toString() || `Sahara TTS connection closed (${code}).`));
  });
  const nextMessage = (predicate, timeout = 15000) => {
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
  nextMessage.failure = () => terminalError;
  return nextMessage;
}

const sessionPools = new Map();

export function saharaPoolKey({ voiceAccent, voiceGender, language }) {
  return JSON.stringify([voiceAccent, voiceGender, language]);
}

function configuredPoolSize() {
  const value = Number(process.env.SAHARA_TTS_POOL_SIZE || DEFAULT_POOL_SIZE);
  return Number.isInteger(value) ? Math.min(3, Math.max(1, value)) : DEFAULT_POOL_SIZE;
}

async function openSaharaSession({ voiceAccent, voiceGender, language, apiKey, keepInReserve = 0 }) {
  if (!reserveStreamSlot({ keepInReserve })) throw streamLimitError();
  const ws = new WebSocket(saharaSocketUrl({ voiceAccent, voiceGender, language }), saharaSocketOptions(apiKey));
  const session = { ws, nextMessage: null, failed: false, idleTimer: null };
  session.nextMessage = createMessageQueue(ws, () => { session.failed = true; });
  try {
    await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    await session.nextMessage((message) => message.message_type === "SESSION_CREATED", 10000);
    return session;
  } catch (error) {
    if (ws.readyState === WebSocket.OPEN) ws.close();
    else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
    throw describeSessionFailure(error);
  }
}

function closeSession(session) {
  clearTimeout(session?.idleTimer);
  if (session?.ws.readyState === WebSocket.OPEN) session.ws.close();
  else if (session?.ws.readyState === WebSocket.CONNECTING) session.ws.terminate();
}

function fillSessionPool(options) {
  const key = saharaPoolKey(options);
  const pool = sessionPools.get(key) || [];
  sessionPools.set(key, pool);
  while (pool.length < configuredPoolSize()) {
    // A warm session is only worth a slot while a real request could still get one.
    if (!hasStreamSlot({ keepInReserve: 1 })) return;
    const entry = { promise: null, ready: false };
    entry.promise = openSaharaSession({ ...options, keepInReserve: 1 })
      .then((session) => {
        entry.ready = true;
        session.idleTimer = setTimeout(() => {
          const index = pool.indexOf(entry);
          if (index >= 0) pool.splice(index, 1);
          closeSession(session);
        }, WARM_SESSION_IDLE_MS);
        return session;
      })
      .catch(() => {
        const index = pool.indexOf(entry);
        if (index >= 0) pool.splice(index, 1);
        return null;
      });
    pool.push(entry);
  }
}

async function acquireSession(options) {
  const key = saharaPoolKey(options);
  const pool = sessionPools.get(key) || [];
  const entry = pool.shift();
  // Only explicitly prewarmed sessions are pooled. A committed Sahara session
  // is single-use, so immediately opening a speculative replacement burns the
  // very small streaming-upgrade allowance without shortening the active turn.
  if (!entry) return openSaharaSession(options);
  const wasWarm = entry.ready;
  const session = await entry.promise;
  if (!session || session.failed || session.ws.readyState !== WebSocket.OPEN) {
    closeSession(session);
    return openSaharaSession(options);
  }
  clearTimeout(session.idleTimer);
  session.fromWarmPool = wasWarm;
  return session;
}

export function prewarmSaharaSession(options) {
  if (!options.apiKey) return;
  fillSessionPool(options);
}

export function closeSaharaSessionPools() {
  for (const pool of sessionPools.values()) {
    for (const entry of pool) entry.promise.then(closeSession);
  }
  sessionPools.clear();
}

export function normalizeSaharaAudioUrl(value) {
  const url = new URL(value, "https://infer.voice.intron.io");
  const trustedHost = url.hostname === "infer.voice.intron.io" || url.hostname.endsWith(".amazonaws.com");
  if (!trustedHost || !["http:", "https:"].includes(url.protocol)) throw new Error("Sahara returned an invalid audio URL.");
  if (url.protocol === "http:") url.protocol = "https:";
  return url;
}

export async function synthesizeWithSaharaGenerate({ chunks, pausesMs = [], voiceAccent, voiceGender, language, apiKey, signal, returnChunks = false, onChunk }) {
  const audioBuffers = await Promise.all(chunks.map(async (text, index) => {
    const response = await fetch("https://infer.voice.intron.io/tts/v1/generate", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_accent: voiceAccent, voice_gender: voiceGender, voice_language: language, output_audio_format: "wav" }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    const audioPath = generatedAudioPath(body);
    // The documented synchronous endpoint can return a recoverable text id when
    // generation outlives the request. Continue that exact job instead of
    // submitting duplicate speech and waiting from zero again.
    const queuedId = textId(body);
    if (!audioPath && queuedId && (response.status === 503 || isQueuedStatus(body))) {
      const audio = await waitForQueuedSpeech(queuedId, { apiKey, signal });
      onChunk?.(index, audio);
      return audio;
    }
    if (!response.ok || !audioPath) throw new Error(body.message || "Sahara fallback speech generation failed.");
    const audio = await downloadAudio(audioPath, signal);
    // Chunks are generated in parallel, so hand each one over the moment it
    // lands: the caller can start playing while the rest are still rendering.
    onChunk?.(index, audio);
    return audio;
  }));
  return returnChunks ? audioBuffers : mergeWavBuffers(audioBuffers, pausesMs);
}

function isQueuedStatus(body) {
  const status = processingStatus(body);
  return status.includes("QUEUED") || status.includes("PENDING") || status.includes("PROCESSING") || /queued|processing/i.test(body?.message || "");
}

// The queue endpoint has a much higher request allowance than streaming and is
// ideal for speculative preload work. It also exposes a status id, so a slow
// render is polled rather than submitted repeatedly.
export async function synthesizeWithSaharaQueue({ chunks, pausesMs = [], voiceAccent, voiceGender, language, apiKey, signal, returnChunks = false, onChunk }) {
  const audioBuffers = await Promise.all(chunks.map(async (text, index) => {
    const response = await fetch("https://infer.voice.intron.io/tts/v1/enqueue", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_accent: voiceAccent, voice_gender: voiceGender, voice_language: language, output_audio_format: "wav" }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Sahara speech could not be queued.");
    const id = textId(body);
    if (!id) {
      const audioPath = generatedAudioPath(body);
      if (!audioPath) throw new Error(body.message || "Sahara returned no speech job.");
      const audio = await downloadAudio(audioPath, signal);
      onChunk?.(index, audio);
      return audio;
    }
    const audio = await waitForQueuedSpeech(id, { apiKey, signal });
    onChunk?.(index, audio);
    return audio;
  }));
  return returnChunks ? audioBuffers : mergeWavBuffers(audioBuffers, pausesMs);
}

export async function submitTextChunks(ws, nextMessage, chunks) {
  const acknowledgements = chunks.map((_, index) => {
    const id = index + 1;
    return nextMessage((message) => message.message_type === "TEXT_CHUNK_ACK" && (message.ack_id === id || message.chunck_id === id || message.chunk_id === id));
  });
  chunks.forEach((chunk, index) => {
    ws.send(JSON.stringify({ message_type: "INPUT_TEXT_CHUNK", text: chunk, ack_id: index + 1 }));
  });
  await Promise.all(acknowledgements);
}

export async function synthesizeWithSahara({ chunks, pausesMs = [], voiceAccent, voiceGender, language, apiKey, signal, readyTimeoutMs = 14000, returnChunks = false, useWarmPool = true, onChunk }) {
  const sessionOptions = { voiceAccent, voiceGender, language, apiKey };
  const session = useWarmPool ? await acquireSession(sessionOptions) : await openSaharaSession(sessionOptions);
  const { ws, nextMessage } = session;
  const abort = () => ws.terminate();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) throw new Error("Sahara TTS request was cancelled.");

    // Register every waiter before sending so fast acknowledgements cannot race
    // past us, then submit all text without serial acknowledgement delays.
    await submitTextChunks(ws, nextMessage, chunks);

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
          onChunk?.(id - 1, audioBuffers[id - 1]);
        }
      }
      if (pending.size) await wait(350);
    }
    if (pending.size) throw new Error(`Sahara speech generation took longer than ${Math.round(readyTimeoutMs / 1000)} seconds.`);

    // Audio is ready. Flush COMMIT and immediately close the session; waiting for
    // COMMITTED_AUDIO kept old sessions open long enough to block the next turn.
    ws.send(JSON.stringify({ message_type: "COMMIT" }));
    ws.close();
    const result = returnChunks ? audioBuffers : mergeWavBuffers(audioBuffers, pausesMs);
    if (session.fromWarmPool) console.info("[latency] Sahara warm session used", { voiceAccent, voiceGender, language });
    return result;
  } catch (error) {
    if (ws.readyState === WebSocket.OPEN) ws.close();
    else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
    throw describeSessionFailure(error instanceof Error ? error : new Error(error?.message || "Sahara TTS connection failed."));
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
