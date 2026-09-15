import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { placeCall, telephonyProvider } from "./telephony.js";

const parsedAttempts = Number.parseInt(process.env.ESCALATION_MAX_ATTEMPTS || "3", 10);
export const ESCALATION_MAX_ATTEMPTS = Number.isFinite(parsedAttempts) && parsedAttempts > 0 ? parsedAttempts : 3;
const parsedBackoff = Number.parseInt(process.env.ESCALATION_RETRY_BACKOFF_SECONDS || "15", 10);
const RETRY_BACKOFF_SECONDS = Number.isFinite(parsedBackoff) && parsedBackoff > 0 ? parsedBackoff : 15;
const RETRY_POLL_MS = 5000;
const RETRY_LEASE_MS = 60_000;

const STATUS_ALIASES = new Map([
  ["queued", "queued"],
  ["ringing", "ringing"],
  ["answered", "answered"],
  ["completed", "completed"],
  ["success", "completed"],
  ["failed", "failed"],
  ["busy", "busy"],
  ["rejected", "rejected"],
  ["unreachable", "unreachable"],
  ["noanswer", "no_answer"],
  ["no answer", "no_answer"],
  ["no_answer", "no_answer"],
  ["no-answer", "no_answer"],
  ["notanswered", "no_answer"],
  ["not answered", "no_answer"],
  ["not_answered", "no_answer"],
  ["not-answered", "no_answer"],
  ["timeout", "no_answer"],
  ["notavailable", "unreachable"],
  ["not_available", "unreachable"],
]);

const UNANSWERED = new Set(["failed", "busy", "rejected", "unreachable", "no_answer"]);
const ANSWERED = new Set(["answered", "completed"]);

export function normalizeVoiceStatus(value) {
  return STATUS_ALIASES.get(String(value || "").trim().toLowerCase()) || null;
}

export function isUnansweredStatus(status) {
  return UNANSWERED.has(status);
}

export function isAnsweredStatus(status) {
  return ANSWERED.has(status);
}

export function retryDelayMs(attempts) {
  return RETRY_BACKOFF_SECONDS * 1000 * (2 ** Math.max(0, Number(attempts || 1) - 1));
}

export async function createVoiceCall({ kind, consultationId, patientId = null, audioPath, to }) {
  const { data, error } = await getSupabaseAdmin().from("voice_calls").insert({
    kind,
    consultation_id: consultationId,
    patient_id: patientId,
    audio_path: audioPath,
    to_number: to,
    status: "pending",
    attempts: 0,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function recordInitialPlacement(callIntent, placement) {
  const values = placement.placed
    ? { status: "queued", session_id: placement.sessionId, attempts: 1, next_attempt_at: null }
    : { status: "not_placed", attempts: 1, next_attempt_at: null };
  const { error } = await getSupabaseAdmin().from("voice_calls").update(values).eq("id", callIntent.id);
  if (error) throw error;
}

export async function findVoiceCall({ callId, sessionId }) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("voice_calls").select("*");
  if (callId) query = query.eq("id", callId);
  else if (sessionId) query = query.eq("session_id", sessionId);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function updateVoiceCall(callId, values) {
  const { error } = await getSupabaseAdmin().from("voice_calls").update(values).eq("id", callId);
  if (error) throw error;
}

export async function updateVoiceCallIfUnanswered(callId, values) {
  const { data, error } = await getSupabaseAdmin()
    .from("voice_calls")
    .update(values)
    .eq("id", callId)
    .is("answered_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function scheduleVoiceCallRetry(call) {
  const attempts = Number(call.attempts || 0);
  if (attempts >= ESCALATION_MAX_ATTEMPTS) {
    const exhausted = await updateVoiceCallIfUnanswered(call.id, { status: "failed_exhausted", next_attempt_at: null });
    if (!exhausted) return false;
    console.error("[telephony] EMERGENCY CALL EXHAUSTED ALL ATTEMPTS", { callId: call.id, attempts });
    return false;
  }
  const nextAttemptAt = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
  const scheduled = await updateVoiceCallIfUnanswered(call.id, { status: "retry_scheduled", next_attempt_at: nextAttemptAt });
  if (!scheduled) return false;
  console.warn("[telephony] emergency call retry scheduled", { callId: call.id, attempts, nextAttemptAt });
  return true;
}

async function claimDueCall(row) {
  const attempts = Number(row.attempts || 0);
  const { data, error } = await getSupabaseAdmin()
    .from("voice_calls")
    // The future timestamp is a lease. If this process dies after claiming the
    // row, another process can recover it instead of leaving it stuck forever.
    .update({ status: "retrying", attempts: attempts + 1, next_attempt_at: new Date(Date.now() + RETRY_LEASE_MS).toISOString() })
    .eq("id", row.id)
    .eq("status", row.status)
    .eq("attempts", attempts)
    .is("answered_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function retryDueCall(row) {
  const claimed = await claimDueCall(row);
  if (!claimed) return;
  try {
    const placement = await placeCall({ to: claimed.to_number, callId: claimed.id });
    if (!placement.placed) throw new Error(placement.reason || "Africa's Talking did not place the retry.");
    await updateVoiceCall(claimed.id, { status: "queued", session_id: placement.sessionId, next_attempt_at: null });
    console.warn("[telephony] emergency call retry placed", { callId: claimed.id, attempt: claimed.attempts });
  } catch (error) {
    console.error("[telephony] emergency call retry failed", { callId: claimed.id, attempt: claimed.attempts, message: error.message });
    await scheduleVoiceCallRetry(claimed);
  }
}

let retryTimer;
let retryScanRunning = false;

export async function scanDueVoiceCallRetries() {
  if (retryScanRunning || !telephonyProvider()) return;
  retryScanRunning = true;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("voice_calls")
      .select("*")
      .eq("kind", "escalation")
      .in("status", ["retry_scheduled", "retrying"])
      .lte("next_attempt_at", new Date().toISOString())
      .limit(10);
    if (error) throw error;
    for (const row of data || []) {
      if (Number(row.attempts || 0) >= ESCALATION_MAX_ATTEMPTS) await scheduleVoiceCallRetry(row);
      else await retryDueCall(row);
    }
  } catch (error) {
    console.error("[telephony] retry scan failed", { message: error.message });
  } finally {
    retryScanRunning = false;
  }
}

export function startVoiceCallRetryWorker() {
  if (retryTimer || !telephonyProvider()) return retryTimer || null;
  scanDueVoiceCallRetries();
  retryTimer = setInterval(scanDueVoiceCallRetries, RETRY_POLL_MS);
  retryTimer.unref?.();
  return retryTimer;
}
