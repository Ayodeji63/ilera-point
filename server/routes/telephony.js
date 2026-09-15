import express, { Router } from "express";
import { getSupabaseAdmin } from "../supabaseAdmin.js";
import { voiceXml } from "../telephony.js";
import { findVoiceCall, isAnsweredStatus, isUnansweredStatus, normalizeVoiceStatus, scheduleVoiceCallRetry, updateVoiceCall, updateVoiceCallIfUnanswered } from "../voiceCalls.js";

export const telephonyRouter = Router();
export const ALERT_URL_TTL_SECONDS = 60 * 30;
const BUCKET = process.env.SUPABASE_ALERT_BUCKET || "escalation-alerts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = Math.max(10, Number.parseInt(process.env.TELEPHONY_CALLBACK_RATE_LIMIT || "120", 10) || 120);
const rateBuckets = new Map();

const rejectXml = () => voiceXml([{ type: "reject" }]);

function callbackRateAllowed(key, now = Date.now()) {
  if (rateBuckets.size > 1000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(bucketKey);
    }
    if (rateBuckets.size > 1000) rateBuckets.delete(rateBuckets.keys().next().value);
  }
  const previous = rateBuckets.get(key);
  if (!previous || now - previous.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  previous.count += 1;
  return previous.count <= RATE_LIMIT;
}

function rateLimit(req, res, next) {
  const allowed = callbackRateAllowed(req.ip || "unknown");
  console.info("[telephony] callback hit", { route: req.path === "/voice" ? "voice" : req.path === "/events" ? "events" : "unknown", allowed });
  if (allowed) return next();
  console.warn("[telephony] callback rate limited", { route: req.path });
  // AT expects a 200 callback response. Refuse work without provoking a retry
  // storm or revealing whether the supplied identifier exists.
  if (req.path === "/voice") return res.type("application/xml").send(rejectXml());
  return res.json({ ok: true });
}

telephonyRouter.use(rateLimit);
telephonyRouter.use((req, res, next) => {
  if (req.is("application/x-www-form-urlencoded")) return next();
  console.warn("[telephony] callback rejected unsupported content type", { route: req.path });
  if (req.path === "/voice") return res.type("application/xml").send(rejectXml());
  return res.json({ ok: true });
});
telephonyRouter.use((req, res, next) => {
  const contentLength = Number.parseInt(req.get("content-length") || "0", 10);
  if (!Number.isFinite(contentLength) || contentLength <= 16 * 1024) return next();
  console.warn("[telephony] oversized callback rejected", { route: req.path });
  if (req.path === "/voice") return res.type("application/xml").send(rejectXml());
  return res.json({ ok: true });
});
telephonyRouter.use(express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 20 }));

telephonyRouter.post("/voice", async (req, res) => {
  const callId = typeof req.body.clientRequestId === "string" && UUID.test(req.body.clientRequestId) ? req.body.clientRequestId : null;
  const sessionId = typeof req.body.sessionId === "string" && SESSION_ID.test(req.body.sessionId) ? req.body.sessionId : null;
  let known = false;
  try {
    const call = callId || sessionId ? await findVoiceCall({ callId, sessionId }) : null;
    known = Boolean(call);
    console.info("[telephony] voice callback", { known, kind: call?.kind || null });
    if (!call) return res.type("application/xml").send(rejectXml());
    if (sessionId && call.session_id && sessionId !== call.session_id) return res.type("application/xml").send(rejectXml());

    const { data: signed, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUrl(call.audio_path, ALERT_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) throw error || new Error("Alert audio could not be signed.");

    await updateVoiceCall(call.id, { status: "answered", answered_at: call.answered_at || new Date().toISOString() });
    const repeats = call.kind === "escalation" ? 2 : 1;
    return res.type("application/xml").send(voiceXml(Array.from({ length: repeats }, () => ({ type: "play", url: signed.signedUrl }))));
  } catch (error) {
    console.error("[telephony] voice callback failed", { known, message: error.message });
    return res.type("application/xml").send(rejectXml());
  }
});

telephonyRouter.post("/events", async (req, res) => {
  const rawCallId = req.body.clientRequestId ?? req.body.client_request_id;
  const rawSessionId = req.body.sessionId ?? req.body.session_id;
  const callId = typeof rawCallId === "string" && UUID.test(rawCallId) ? rawCallId : null;
  const sessionId = typeof rawSessionId === "string" && SESSION_ID.test(rawSessionId) ? rawSessionId : null;
  const rawStatus = req.body.status;
  // If AT supplied a status we do not recognize, do not reinterpret the more
  // general "Completed" session state as proof that a person answered.
  const status = normalizeVoiceStatus(rawStatus)
    || (rawStatus == null ? normalizeVoiceStatus(req.body.callSessionState ?? req.body.call_session_state) : null);
  let known = false;
  try {
    const call = await findVoiceCall({ callId, sessionId });
    known = Boolean(call);
    console.info("[telephony] event callback", { known, status });
    if (!call || !status) return res.json({ ok: true });

    // A delayed callback from a previous retry must not overwrite the active
    // attempt's state or schedule a duplicate call.
    if (sessionId && call.session_id && sessionId !== call.session_id) {
      console.warn("[telephony] stale event ignored", { callId: call.id, status });
      return res.json({ ok: true });
    }

    if (call.kind === "escalation" && isUnansweredStatus(status) && !call.answered_at) {
      // Conditional persistence closes the race where an answer callback and
      // a delayed no-answer event arrive at nearly the same time.
      const stillUnanswered = await updateVoiceCallIfUnanswered(call.id, { status });
      if (stillUnanswered) await scheduleVoiceCallRetry(stillUnanswered);
      return res.json({ ok: true });
    }
    if (call.answered_at && !isAnsweredStatus(status)) return res.json({ ok: true });
    const values = { status };
    if (isAnsweredStatus(status) && !call.answered_at) values.answered_at = new Date().toISOString();
    await updateVoiceCall(call.id, values);
    return res.json({ ok: true });
  } catch (error) {
    console.error("[telephony] event callback failed", { known, status, message: error.message });
    // A generic success prevents a hostile or malformed callback from learning
    // whether any consultation or call id exists.
    return res.json({ ok: true });
  }
});

// Keep malformed/oversized provider callbacks generic and HTTP 200. The
// callback surface never exposes Express parser details to an external caller.
telephonyRouter.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.warn("[telephony] callback body rejected", { route: req.path, type: error?.type || "invalid" });
  if (req.path === "/voice") return res.type("application/xml").send(rejectXml());
  return res.json({ ok: true });
});
