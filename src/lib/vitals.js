const CAPTURE_TIMEOUT_MS = 42000;
const DEFAULT_VITALS_ORIGIN = "http://127.0.0.1:8787";

function configuredVitalsOrigin() {
  return (import.meta.env.VITE_VITALS_API_ORIGIN || DEFAULT_VITALS_ORIGIN).trim().replace(/\/+$/, "");
}

export function vitalsUrl(path) {
  return `${configuredVitalsOrigin()}${path}`;
}

function vitalsFetch(fetchImpl, path, options = {}) {
  const origin = configuredVitalsOrigin();
  return fetchImpl(`${origin}${path}`, {
    ...options,
    // Chromium 146+ classifies 127.0.0.1 separately from LAN addresses. An
    // explicit "local" hint rejects a loopback connection before CORS or the
    // permission allowlist runs, so this must match the loopback destination.
    ...(origin ? { targetAddressSpace: "loopback" } : {}),
  });
}

async function responseBody(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The vitals sensors are unavailable.");
  return body;
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Vitals capture was cancelled.", "AbortError"));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function captureStage(startPath, { onUpdate = () => {}, signal, fetchImpl = fetch, pollMs = 350, timeoutMs = CAPTURE_TIMEOUT_MS } = {}) {
  const started = await responseBody(await vitalsFetch(fetchImpl, startPath, { method: "POST", signal }));
  if (!started.session_id) throw new Error("The vitals sensor did not start correctly.");
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await wait(pollMs, signal);
    const state = await responseBody(await vitalsFetch(fetchImpl, `/api/vitals/session/${encodeURIComponent(started.session_id)}`, { signal }));
    onUpdate(state);
    if (["complete", "partial"].includes(state.status) && state.result) return state.result;
    if (state.status === "error") throw new Error(state.error || "A stable reading was not captured.");
  }
  throw new Error("The sensors could not get a stable reading in time.");
}

export function captureVitals(options) {
  return captureStage("/api/vitals/session", options);
}

export function capturePulseVitals(options) {
  return captureStage("/api/vitals/pulse/session", options);
}

export function captureTemperatureVitals(options) {
  return captureStage("/api/vitals/temperature/session", options);
}
