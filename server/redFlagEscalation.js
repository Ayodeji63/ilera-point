import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { synthesizeWithSaharaGenerate } from "./saharaTts.js";
import { escalationNumber, placeCall, telephonyProvider } from "./telephony.js";
import { isTransientSaharaFailure } from "./speechRetry.js";
import { createVoiceCall, recordInitialPlacement, scheduleVoiceCallRetry, updateVoiceCall } from "./voiceCalls.js";

const BUCKET = process.env.SUPABASE_ALERT_BUCKET || "escalation-alerts";

// Sahara caps the streaming TTS socket at three connections a minute, and those
// belong to the patient at the kiosk. An alert uses the generate endpoint
// instead, which allows sixty a minute, so escalation never competes with the
// conversation a patient is in the middle of.
const MIN_CHUNK = 10;
const MAX_CHUNK = 100;

export function splitForSpeech(text) {
  const chunks = [];
  let current = "";
  for (const word of String(text).trim().split(/\s+/)) {
    if (`${current} ${word}`.trim().length > MAX_CHUNK && current) { chunks.push(current); current = word; }
    else current = `${current} ${word}`.trim();
  }
  if (current) chunks.push(current);
  return chunks.map((chunk) => (chunk.length < MIN_CHUNK ? chunk.padEnd(MIN_CHUNK, " ") : chunk));
}

// No patient name and no clinical detail beyond the trigger. A voice call can be
// overheard or land in a voicemail box, so the identifying record stays behind
// the authenticated queue; the call exists to make a phone ring.
export function alertScript(triggers) {
  const reason = triggers?.length ? triggers.join(", ") : "an urgent safety flag";
  return `This is an urgent IleraPoint alert. A patient checking in has reported ${reason}. Please open the IleraPoint consultation queue and review the case now.`;
}

export function alertPath(consultationId) {
  return `${consultationId}/${Date.now()}.wav`;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Sahara can answer the generate endpoint with "queued for processing" while it
// is still rendering. For an emergency alert that is worth waiting out rather
// than abandoning, so this backs off and asks again.
async function renderAlert(text, apiKey, signal, attempts = 3) {
  const chunks = splitForSpeech(text);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await synthesizeWithSaharaGenerate({ chunks, pausesMs: [], voiceAccent: "yoruba", voiceGender: "female", language: "en", apiKey, signal });
    } catch (error) {
      lastError = error;
      if (signal?.aborted || !isTransientSaharaFailure(error.message) || attempt === attempts) throw error;
      console.warn("[escalation] alert audio not ready; retrying", { attempt, message: error.message });
      await wait(attempt * 2000);
    }
  }
  throw lastError;
}

// Speaks the alert with the same Sahara voice that speaks to patients, stores it
// privately, and rings the on-call clinician with it. Every failure is contained:
// escalation is best effort and must never fail the consultation save.
export async function escalateRedFlag({ consultationId, triggers, signal }) {
  const apiKey = process.env.SAHARA_API_KEY;
  if (!apiKey) return { escalated: false, reason: "SAHARA_API_KEY is not configured" };
  if (!telephonyProvider()) return { escalated: false, reason: "no telephony provider configured" };
  const to = escalationNumber();
  if (!to) return { escalated: false, reason: "ESCALATION_PHONE_NUMBER is not set" };

  const audio = await renderAlert(alertScript(triggers), apiKey, signal);

  const supabase = getSupabaseAdmin();
  const path = alertPath(consultationId);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, audio, { contentType: "audio/wav", upsert: false });
  if (uploadError) throw uploadError;

  const intent = await createVoiceCall({ kind: "escalation", consultationId, audioPath: path, to });
  try {
    const call = await placeCall({ to, callId: intent.id, signal });
    await recordInitialPlacement(intent, call);
    if (!call.placed) await scheduleVoiceCallRetry({ ...intent, attempts: 1 });
    return { escalated: call.placed, audioPath: path, callId: intent.id, ...call };
  } catch (error) {
    // The durable intent remains actionable even when the provider's first
    // request fails. Scheduling is also best effort; the outer background
    // boundary still contains every failure away from consultation saving.
    try {
      await updateVoiceCall(intent.id, { status: "placement_failed", attempts: 1 });
      await scheduleVoiceCallRetry({ ...intent, attempts: 1 });
    } catch (scheduleError) {
      console.error("[escalation] initial call retry could not be scheduled", { callId: intent.id, message: scheduleError.message });
    }
    throw error;
  }
}

// Fire and forget. The consultation is already saved by the time this runs.
export function escalateInBackground(options) {
  escalateRedFlag(options)
    .then((result) => {
      if (result.escalated) console.warn("[escalation] on-call clinician called", { consultationId: options.consultationId, provider: result.provider });
      else console.warn("[escalation] alert not placed", { consultationId: options.consultationId, reason: result.reason });
    })
    .catch((error) => console.error("[escalation] failed", { consultationId: options.consultationId, message: error.message }));
}
