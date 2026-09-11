// Places the escalation call. Deliberately inert rather than throwing when no
// provider is configured, so a red flag never fails a consultation save just
// because telephony credentials are missing.
export function telephonyProvider() {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) return "twilio";
  return null;
}

export function escalationNumber() {
  return String(process.env.ESCALATION_PHONE_NUMBER || "").trim();
}

// Twilio accepts TwiML inline, so there is no need to host a callback endpoint
// just to play one file. The audio URL is a short-lived Supabase signed URL.
export function playTwiml(audioUrl) {
  const escaped = audioUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<Response><Pause length="1"/><Play>${escaped}</Play><Play>${escaped}</Play></Response>`;
}

export async function placeCall({ to, audioUrl, signal }) {
  const provider = telephonyProvider();
  if (!provider) return { placed: false, reason: "no telephony provider configured" };
  if (!to) return { placed: false, reason: "ESCALATION_PHONE_NUMBER is not set" };

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const body = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER, Twiml: playTwiml(audioUrl) });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || `Telephony provider returned HTTP ${response.status}.`);
  return { placed: true, provider, callSid: result.sid };
}
