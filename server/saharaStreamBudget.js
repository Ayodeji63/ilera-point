// Sahara allows only 3 upgrades per minute per key on /tts/v1/stream. Past that
// limit its gunicorn origin completes the WebSocket handshake and then writes a
// plain "HTTP/1.1 429 TOO MANY REQUESTS ... ratelimit exceeded 3 per 1 minute"
// response onto the upgraded socket. `ws` reads those ASCII bytes as a frame
// header ('H' is 0x48, which sets RSV1) and rejects the session with
// "Invalid WebSocket frame: RSV1 must be clear". The generate endpoint allows 60
// per minute, so we spend stream slots deliberately and fall back to HTTP.
const WINDOW_MS = 60000;
const DEFAULT_LIMIT = 3;
const MAX_BLOCK_SECONDS = 120;

const opens = [];
let blockedUntil = 0;

export function streamConnectionLimit() {
  const value = Number(process.env.SAHARA_STREAM_LIMIT_PER_MINUTE || DEFAULT_LIMIT);
  return Number.isInteger(value) && value > 0 ? Math.min(60, value) : DEFAULT_LIMIT;
}

function prune(now) {
  while (opens.length && now - opens[0] >= WINDOW_MS) opens.shift();
}

// `keepInReserve` lets speculative work (warm pool refills) leave slots for the
// requests a caller is actually waiting on.
export function hasStreamSlot({ keepInReserve = 0, now = Date.now() } = {}) {
  prune(now);
  if (now < blockedUntil) return false;
  return opens.length + keepInReserve < streamConnectionLimit();
}

export function reserveStreamSlot({ keepInReserve = 0, now = Date.now() } = {}) {
  if (!hasStreamSlot({ keepInReserve, now })) return false;
  opens.push(now);
  return true;
}

export function noteStreamRateLimited({ retryAfterSeconds = 60, now = Date.now() } = {}) {
  const seconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.min(MAX_BLOCK_SECONDS, retryAfterSeconds)
    : 60;
  blockedUntil = Math.max(blockedUntil, now + seconds * 1000);
}

export function streamBudgetDelaySeconds(now = Date.now()) {
  prune(now);
  if (now < blockedUntil) return Math.ceil((blockedUntil - now) / 1000);
  if (!opens.length) return 0;
  return Math.ceil((WINDOW_MS - (now - opens[0])) / 1000);
}

export function resetStreamBudget() {
  opens.length = 0;
  blockedUntil = 0;
}
