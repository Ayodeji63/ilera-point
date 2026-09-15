// Africa's Talking call creation and Voice XML. This module is deliberately
// inert when credentials are absent: telephony is an extra escalation channel,
// never a prerequisite for saving a consultation.

const VOICE_BASE_URLS = {
  live: "https://voice.africastalking.com",
  sandbox: "https://voice.sandbox.africastalking.com",
};

export function telephonyProvider() {
  if (process.env.AT_USERNAME && process.env.AT_API_KEY && process.env.AT_PHONE_NUMBER) return "africastalking";
  return null;
}

export function voiceBaseUrl() {
  const environment = String(process.env.AT_ENVIRONMENT || "live").trim().toLowerCase();
  if (!VOICE_BASE_URLS[environment]) throw new Error("AT_ENVIRONMENT must be sandbox or live.");
  return VOICE_BASE_URLS[environment];
}

export function escalationNumber() {
  return String(process.env.ESCALATION_PHONE_NUMBER || "").trim();
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Only known actions can become XML. Callback input is never interpolated into
// an action type, and all action data is escaped before it reaches the response.
export function voiceXml(actions = []) {
  const body = actions.map((action) => {
    if (action?.type === "play") return `<Play url="${escapeXml(action.url)}"/>`;
    if (action?.type === "say") return `<Say>${escapeXml(action.text)}</Say>`;
    if (action?.type === "reject") return "<Reject/>";
    if (action?.type === "pause") return `<Pause length="${Math.max(1, Math.min(60, Math.round(Number(action.seconds) || 1)))}"/>`;
    throw new Error("Unsupported Africa's Talking Voice XML action.");
  }).join("");
  return `<Response>${body}</Response>`;
}

export async function placeCall({ to, callId, signal }) {
  const provider = telephonyProvider();
  if (!provider) return { placed: false, provider: null, sessionId: null, reason: "no telephony provider configured" };
  if (!to) return { placed: false, provider, sessionId: null, reason: "ESCALATION_PHONE_NUMBER is not set" };
  if (!callId) return { placed: false, provider, sessionId: null, reason: "call intent id is required" };

  const body = new URLSearchParams({
    username: process.env.AT_USERNAME,
    to,
    from: process.env.AT_PHONE_NUMBER,
    clientRequestId: callId,
  });
  const response = await fetch(`${voiceBaseUrl()}/call`, {
    method: "POST",
    headers: {
      apiKey: process.env.AT_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
  });
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : {}; }
  catch { result = {}; }
  if (!response.ok) throw new Error(result.errorMessage || result.message || `Telephony provider returned HTTP ${response.status}.`);

  const entry = Array.isArray(result.entries) ? result.entries[0] : null;
  const sessionId = entry?.sessionId || null;
  const entryStatus = String(entry?.status || "").trim().toLowerCase();
  const placementRejected = entryStatus && !new Set(["queued", "success"]).has(entryStatus);
  if (!sessionId || placementRejected) {
    return { placed: false, provider, sessionId: null, reason: entry?.status || result.errorMessage || "Africa's Talking did not queue the call" };
  }
  return { placed: true, provider, sessionId };
}
