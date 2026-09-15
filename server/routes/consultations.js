import { Router } from "express";
import multer from "multer";
import { getSupabaseAdmin, requireDoctor } from "../supabaseAdmin.js";
import {
  collectionView,
  createPatientReturnCode,
  createPatientToken,
  hashPatientReturnCode,
  hashPatientToken,
  normalizePatientReturnCode,
  patientTokenMatches,
} from "../consultationAccess.js";
import { missingColumnHint } from "../schemaHints.js";
import { canSeeEveryTier, canWorkCase, routeConsultation, tierForRole } from "../careRouting.js";
import { escalateInBackground } from "../redFlagEscalation.js";
import { recordAuditEvent } from "../auditEvents.js";
import { CONSENT_NOTICE_VERSION, expiresAfterDays, retentionDays, safeRequestMetadata } from "../privacy.js";
import { validateClinicalProfile } from "../../shared/clinicalProfile.js";
import { normalizePhone } from "./patients.js";

export const consultationsRouter = Router();
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const BUCKET = process.env.SUPABASE_VIDEO_BUCKET || "consultation-videos";
const resultLookupBuckets = new Map();
const RESULT_LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const RESULT_LOOKUP_LIMIT = Number.parseInt(process.env.PATIENT_RESULT_LOOKUP_RATE_LIMIT || "10", 10);
const configuredResultHours = Number.parseInt(process.env.PATIENT_RESULT_ACCESS_HOURS || "168", 10);
const PATIENT_RESULT_ACCESS_HOURS = Number.isFinite(configuredResultHours)
  ? Math.min(720, Math.max(1, configuredResultHours))
  : 168;

function permitResultLookup(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = resultLookupBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RESULT_LOOKUP_WINDOW_MS) {
    resultLookupBuckets.set(key, { startedAt: now, count: 1 });
  } else if (++bucket.count > RESULT_LOOKUP_LIMIT) {
    res.set("Retry-After", String(Math.ceil((RESULT_LOOKUP_WINDOW_MS - (now - bucket.startedAt)) / 1000)));
    return res.status(429).json({ error: "Too many result checks. Please wait or ask a health worker for help." });
  }
  if (resultLookupBuckets.size > 1000) resultLookupBuckets.delete(resultLookupBuckets.keys().next().value);
  next();
}

function resultAccessExpired(consultation) {
  const expiry = consultation?.patient_result_expires_at || consultation?.patient_token_expires_at;
  return !expiry || new Date(expiry).getTime() <= Date.now();
}

consultationsRouter.post("/", videoUpload.single("video"), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.consultation || "{}");
    if (!payload.patient_id || !Array.isArray(payload.turns) || !payload.structured_record) return res.status(400).json({ error: "A complete consultation record is required." });
    const profileValidation = validateClinicalProfile(payload.structured_record.patient_profile);
    if (!profileValidation.valid) {
      return res.status(400).json({
        error: "Age, weight where required, sex at birth, pregnancy and breastfeeding status, allergies, current medicines, kidney/liver status, and state must be confirmed before this consultation is sent.",
        code: "clinical_profile_required",
        fields: profileValidation.errors.map(({ field }) => field),
      });
    }
    payload.structured_record.patient_profile = profileValidation.profile;
    if (payload.consent_notice_version !== CONSENT_NOTICE_VERSION || payload.audio_processing_consent !== true) {
      return res.status(400).json({ error: "Current microphone and data-processing consent is required before this consultation can be saved." });
    }
    const supabase = getSupabaseAdmin();
    let videoPath = null;
    if (payload.video_consent && req.file) {
      // This recording is for human clinician review only. No AI model receives or analyses it.
      videoPath = `${payload.patient_id}/${crypto.randomUUID()}.webm`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(videoPath, req.file.buffer, { contentType: "video/webm", upsert: false });
      if (uploadError) throw uploadError;
    }
    // The kiosk keeps this token so the waiting patient can read their own
    // result without an account. It is returned once and never listed.
    const patientToken = createPatientToken();
    const patientReturnCode = createPatientReturnCode();
    const resultExpiresAt = new Date(Date.now() + PATIENT_RESULT_ACCESS_HOURS * 60 * 60 * 1000).toISOString();
    // Routing is decided here, from the record, not by the browser: a modified
    // kiosk must not be able to route its own case away from a doctor.
    const routed = routeConsultation({ record: payload.structured_record, redFlagStatus: payload.red_flag_status });
    const { data, error } = await supabase.from("consultations").insert({
      ...payload,
      video_url: videoPath,
      status: "pending",
      patient_token_hash: hashPatientToken(patientToken),
      patient_token_expires_at: resultExpiresAt,
      patient_return_code_hash: hashPatientReturnCode(patientReturnCode),
      patient_result_expires_at: resultExpiresAt,
      consent_notice_version: CONSENT_NOTICE_VERSION,
      audio_processing_consent: true,
      research_reuse_consent: Boolean(payload.research_reuse_consent),
      ai_provenance: {
        interview_provider: "gemini",
        interview_model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        interview_prompt_version: "intake-2026-09-15.v1",
        speech_provider: "sahara",
      },
      retention_until: expiresAfterDays(retentionDays.clinical),
      video_retention_until: videoPath ? expiresAfterDays(retentionDays.video) : null,
      assigned_tier: routed.tier,
      routing_reasons: routed.reasons,
    }).select("id,status,created_at").single();
    if (error) {
      if (videoPath) await supabase.storage.from(BUCKET).remove([videoPath]);
      throw error;
    }
    const { error: consentError } = await supabase.from("consent_records").insert({
      consultation_id: data.id,
      patient_id: payload.patient_id,
      notice_version: CONSENT_NOTICE_VERSION,
      language_code: payload.language_pair || "en",
      audio_processing: true,
      continuous_video: Boolean(payload.video_consent),
      research_reuse: Boolean(payload.research_reuse_consent),
      retention_until: expiresAfterDays(retentionDays.clinical),
    });
    if (consentError) {
      await supabase.from("consultations").delete().eq("id", data.id);
      if (videoPath) await supabase.storage.from(BUCKET).remove([videoPath]);
      throw consentError;
    }
    await recordAuditEvent({
      action: "consultation.created",
      actorType: "patient",
      consultationId: data.id,
      patientId: payload.patient_id,
      metadata: { ...safeRequestMetadata(req), video: Boolean(videoPath), consent_version: CONSENT_NOTICE_VERSION },
    });
    // A red flag rings the on-call clinician with a spoken alert, in the same
    // Sahara voice the patient just heard. Started after the record is safely
    // stored, and never allowed to fail the save.
    if (payload.red_flag_status?.emergency) {
      escalateInBackground({ consultationId: data.id, triggers: payload.red_flag_status.triggers });
    }
    res.status(201).json({ consultation: {
      ...data,
      patient_token: patientToken,
      patient_return_code: patientReturnCode,
      patient_result_expires_at: resultExpiresAt,
    } });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0012_patient_result_return.sql") || error.message }); }
});

// A patient who left the kiosk can return with the random code shown on their
// receipt plus the complete phone number already attached to their record. The
// same generic response covers a wrong, expired, or missing capability.
consultationsRouter.post("/result/lookup", permitResultLookup, async (req, res) => {
  const returnCode = normalizePatientReturnCode(req.body.code);
  const phone = normalizePhone(req.body.phone);
  if (returnCode.length !== 12 || phone.length < 10) return res.status(404).json({ error: "No active visit result matched those details." });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("consultations")
      .select("id,status,patient_result_expires_at,patients!inner(phone_normalized),prescriptions(drug,dosage,instructions,created_at)")
      .eq("patient_return_code_hash", hashPatientReturnCode(returnCode))
      .maybeSingle();
    if (error) throw error;
    const patientPhone = Array.isArray(data?.patients) ? data.patients[0]?.phone_normalized : data?.patients?.phone_normalized;
    if (!data || resultAccessExpired(data) || normalizePhone(patientPhone) !== phone) {
      return res.status(404).json({ error: "No active visit result matched those details." });
    }

    const result = collectionView(data, data.prescriptions?.[0] || null);
    await recordAuditEvent({ action: "patient.result_returned", actorType: "patient", consultationId: data.id, metadata: safeRequestMetadata(req) });
    return res.json({ result, expires_at: data.patient_result_expires_at });
  } catch (error) {
    return res.status(502).json({ error: missingColumnHint(error, "0012_patient_result_return.sql") || "Your result could not be checked." });
  }
});

// The active kiosk reads only this patient's outcome — never the transcript,
// structured record, or video. The separate return-code route exposes the same
// minimized view after a second phone-number factor.
consultationsRouter.get("/:id/result", async (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(404).json({ error: "No consultation was found." });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("consultations")
      .select("id,status,patient_token_hash,patient_token_expires_at,patient_token_consumed_at,patient_result_expires_at,prescriptions(drug,dosage,instructions,created_at)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    // A wrong token is answered exactly like a missing consultation, so the
    // endpoint never confirms that an id exists.
    const legacyConsumed = !data?.patient_result_expires_at && data?.patient_token_consumed_at;
    if (!data || resultAccessExpired(data) || legacyConsumed || !patientTokenMatches(data.patient_token_hash, token)) return res.status(404).json({ error: "No consultation was found." });
    const result = collectionView(data, data.prescriptions?.[0] || null);
    if (result.finished) {
      await recordAuditEvent({ action: "patient.result_viewed", actorType: "patient", consultationId: data.id, metadata: safeRequestMetadata(req) });
    }
    res.json({ result });
  } catch (error) {
    res.status(502).json({ error: missingColumnHint(error, "0012_patient_result_return.sql") || "Your result could not be checked." });
  }
});

// The active patient capability can withdraw only optional secondary uses. The
// clinical record remains available for care and legal recordkeeping.
consultationsRouter.patch("/:id/consent/withdraw", async (req, res) => {
  const token = String(req.body.token || "");
  if (!token) return res.status(404).json({ error: "No consultation was found." });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("consultations")
      .select("id,patient_id,video_url,patient_token_hash,patient_token_expires_at,patient_token_consumed_at")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    const expired = !data?.patient_token_expires_at || new Date(data.patient_token_expires_at).getTime() <= Date.now();
    if (!data || expired || data.patient_token_consumed_at || !patientTokenMatches(data.patient_token_hash, token)) return res.status(404).json({ error: "No consultation was found." });
    if (data.video_url) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([data.video_url]);
      if (storageError) throw storageError;
    }
    const withdrawnAt = new Date().toISOString();
    const { error: updateError } = await supabase.from("consultations").update({ video_url: null, video_consent: false, research_reuse_consent: false, video_retention_until: null }).eq("id", data.id);
    if (updateError) throw updateError;
    const { error: consentError } = await supabase.from("consent_records").update({ continuous_video: false, research_reuse: false, withdrawn_at: withdrawnAt }).eq("consultation_id", data.id);
    if (consentError) throw consentError;
    await recordAuditEvent({ action: "consent.optional_withdrawn", actorType: "patient", consultationId: data.id, patientId: data.patient_id, metadata: safeRequestMetadata(req) });
    res.json({ withdrawn: true });
  } catch (error) {
    res.status(502).json({ error: missingColumnHint(error, "0010_ethics_privacy.sql") || "Optional consent could not be withdrawn. Ask a health worker for help." });
  }
});

consultationsRouter.get("/", requireDoctor, async (req, res) => {
  try {
    let query = getSupabaseAdmin()
      .from("consultations")
      .select("id,created_at,status,red_flag_status,structured_record,assigned_tier,routing_reasons,patients(id,name,phone)")
      .in("status", ["pending", "flagged"]);
    // A community health worker sees only cases routed to their tier. This is
    // the delegation itself: not list ordering, but which cases exist for them.
    if (!canSeeEveryTier(req.doctor.role)) query = query.eq("assigned_tier", tierForRole(req.doctor.role));
    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw error;
    await recordAuditEvent({ action: "consultation.queue_viewed", actorType: "clinician", actorId: req.doctor.id, metadata: { ...safeRequestMetadata(req), result_count: data.length } });
    res.json({ consultations: data, tier: tierForRole(req.doctor.role), role: req.doctor.role });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0004_task_shifting.sql") || error.message }); }
});

// Escalation is one-way and always available: a clinician who is unsure hands
// the case up. Nothing ever routes a case back down to a narrower tier.
consultationsRouter.patch("/:id/escalate", requireDoctor, async (req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("consultations")
      .update({ assigned_tier: "doctor", escalated_by: req.doctor.id, escalated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select("id,assigned_tier")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No consultation was found." });
    await recordAuditEvent({ action: "consultation.escalated", actorType: "clinician", actorId: req.doctor.id, consultationId: data.id, metadata: safeRequestMetadata(req) });
    res.json({ consultation: data });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0004_task_shifting.sql") || error.message }); }
});

consultationsRouter.get("/:id", requireDoctor, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("consultations").select("*,patients(id,name,phone),prescriptions(*)").eq("id", req.params.id).single();
    if (error) throw error;
    // Answered as not-found rather than forbidden: a narrower tier learns
    // nothing about cases outside it, not even that they exist.
    if (!canWorkCase(req.doctor.role, data.assigned_tier)) return res.status(404).json({ error: "No consultation was found." });
    let signedVideoUrl = null;
    if (data.video_url) {
      const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(data.video_url, 60 * 30);
      if (signedError) throw signedError;
      signedVideoUrl = signed.signedUrl;
    }
    await recordAuditEvent({ action: "consultation.viewed", actorType: "clinician", actorId: req.doctor.id, consultationId: data.id, metadata: { ...safeRequestMetadata(req), video_url_issued: Boolean(signedVideoUrl) } });
    res.json({ consultation: { ...data, signedVideoUrl } });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0010_ethics_privacy.sql") || error.message }); }
});

consultationsRouter.patch("/:id/status", requireDoctor, async (req, res) => {
  if (!["reviewed", "flagged"].includes(req.body.status)) return res.status(400).json({ error: "Status must be reviewed or flagged." });
  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("consultations").select("assigned_tier").eq("id", req.params.id).maybeSingle();
    if (!existing || !canWorkCase(req.doctor.role, existing.assigned_tier)) return res.status(404).json({ error: "No consultation was found." });
    const { data, error } = await supabase.from("consultations").update({ status: req.body.status }).eq("id", req.params.id).select("id,status").single();
    if (error) throw error;
    await recordAuditEvent({ action: `consultation.${req.body.status}`, actorType: "clinician", actorId: req.doctor.id, consultationId: data.id, metadata: safeRequestMetadata(req) });
    res.json({ consultation: data });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0010_ethics_privacy.sql") || error.message }); }
});
