const RETRYABLE_STATUSES = new Set([401, 403, 408, 429, 500, 502, 503, 504]);
const cooldowns = new Map();
let nextKeyIndex = 0;

function splitKeys(value) {
  if (Array.isArray(value)) return value.flatMap(splitKeys);
  return String(value || "").split(/[\n,;]+/).map((key) => key.trim()).filter(Boolean);
}

export function geminiApiKeys(source = process.env) {
  if (typeof source === "string" || Array.isArray(source)) return [...new Set(splitKeys(source))];
  return [...new Set([...splitKeys(source.GEMINI_API_KEY), ...splitKeys(source.GEMINI_API_KEYS)])];
}

export function hasGeminiApiKeys(source = process.env) {
  return geminiApiKeys(source).length > 0;
}

function orderedAvailableKeys(keys, now = Date.now()) {
  const start = nextKeyIndex % keys.length;
  nextKeyIndex = (nextKeyIndex + 1) % keys.length;
  const ordered = keys.map((_, index) => keys[(start + index) % keys.length]);
  const ready = ordered.filter((key) => (cooldowns.get(key) || 0) <= now);
  if (ready.length) return ready;
  // Do not fan out requests while every credential is known to be throttled.
  // Probe only the key whose cooldown expires first.
  return [ordered.reduce((soonest, key) => (cooldowns.get(key) || 0) < (cooldowns.get(soonest) || 0) ? key : soonest)];
}

function cooldownMilliseconds(response) {
  const retryAfter = Number(response.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 5 * 60_000);
  if (response.status === 429) return 60_000;
  if (response.status === 401 || response.status === 403) return 5 * 60_000;
  return 10_000;
}

export async function geminiGenerateContent({ model, body, signal, apiKeys, fetchImpl = fetch }) {
  const keys = geminiApiKeys(apiKeys === undefined ? process.env : apiKeys);
  if (!keys.length) throw new Error("GEMINI_API_KEY or GEMINI_API_KEYS is not configured.");
  const candidates = orderedAvailableKeys(keys);
  let lastResponse;
  let lastError;

  for (let index = 0; index < candidates.length; index += 1) {
    const key = candidates[index];
    try {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      lastResponse = response;
      if (!RETRYABLE_STATUSES.has(response.status)) return response;
      cooldowns.set(key, Date.now() + cooldownMilliseconds(response));
      if (index === candidates.length - 1) return response;
      console.warn("[Gemini] request failed; switching configured key", { status: response.status, attempt: index + 1, availableKeys: candidates.length });
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw error;
      lastError = error;
      cooldowns.set(key, Date.now() + 10_000);
      if (index < candidates.length - 1) console.warn("[Gemini] connection failed; switching configured key", { attempt: index + 1, availableKeys: candidates.length });
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Gemini request failed.");
}

export function resetGeminiKeyPoolForTests() {
  cooldowns.clear();
  nextKeyIndex = 0;
}
