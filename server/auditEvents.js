import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { expiresAfterDays, retentionDays } from "./privacy.js";

// Audit metadata must describe the action, never duplicate transcripts, names,
// phone numbers, tokens, prescription text, or other clinical content.
export async function recordAuditEvent({
  action,
  actorType = "system",
  actorId = null,
  consultationId = null,
  patientId = null,
  outcome = "success",
  metadata = {},
}) {
  try {
    const { error } = await getSupabaseAdmin().from("audit_events").insert({
      action,
      actor_type: actorType,
      actor_id: actorId,
      consultation_id: consultationId,
      patient_id: patientId,
      outcome,
      metadata,
      retention_until: expiresAfterDays(retentionDays.audit),
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("[audit] event could not be persisted", { action, message: error.message });
    return false;
  }
}

export async function recordAiProcessingEvent({
  consultationId,
  actorId,
  purpose,
  provider,
  model,
  promptVersion,
  languageCode,
  inputHash,
  valid,
  errorCode = null,
}) {
  try {
    const { error } = await getSupabaseAdmin().from("ai_processing_events").insert({
      consultation_id: consultationId,
      actor_id: actorId,
      purpose,
      provider,
      model,
      prompt_version: promptVersion,
      language_code: languageCode,
      input_hash: inputHash,
      valid,
      error_code: errorCode,
      retention_until: expiresAfterDays(retentionDays.audit),
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("[audit] AI event could not be persisted", { purpose, message: error.message });
    return false;
  }
}
