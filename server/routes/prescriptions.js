import { Router } from "express";
import { getSupabaseAdmin, requireDoctor } from "../supabaseAdmin.js";
import { canWorkCase } from "../careRouting.js";
import { checkPrescription, interactionWarning } from "../medicationSafety.js";
import { missingColumnHint } from "../schemaHints.js";
import { parsePrescriptionTranscript, validateParsedPrescription } from "../prescriptionParse.js";
import { geminiApiKeys, hasGeminiApiKeys } from "../geminiClient.js";
import { recordAiProcessingEvent, recordAuditEvent } from "../auditEvents.js";
import { PRESCRIPTION_PROMPT_VERSION, safeRequestMetadata, sha256 } from "../privacy.js";
import { languageDeployment } from "../languageSafety.js";
import { assessPrescriptionContext, validateClinicalProfile } from "../../shared/clinicalProfile.js";

export const prescriptionsRouter = Router();
const LANGUAGE_CODES = new Set(["en", "yo", "pcm", "ha", "ig"]);

async function clinicianConsultation(req, consultationId) {
  const { data, error } = await getSupabaseAdmin()
    .from("consultations")
    .select("assigned_tier,structured_record")
    .eq("id", consultationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !canWorkCase(req.doctor.role, data.assigned_tier)) return null;
  return data;
}

prescriptionsRouter.post("/parse", requireDoctor, async (req, res) => {
  const consultationId = String(req.body.consultation_id || "");
  const transcript = typeof req.body.transcript === "string" ? req.body.transcript.trim() : "";
  const languageCode = String(req.body.language_code || "en");
  const speechFileId = typeof req.body.speech_file_id === "string" ? req.body.speech_file_id.slice(0, 240) : null;
  if (!consultationId || !transcript) return res.status(400).json({ error: "A consultation and dictation transcript are required." });
  if (transcript.length > 3000) return res.status(400).json({ error: "The dictation is too long. Dictate one prescription at a time." });
  if (!LANGUAGE_CODES.has(languageCode)) return res.status(400).json({ error: "Choose a supported dictation language." });
  if (!hasGeminiApiKeys()) return res.status(503).json({ error: "GEMINI_API_KEY or GEMINI_API_KEYS is not configured." });

  const deployment = languageDeployment(languageCode);
  if (!deployment.allowed) return res.status(503).json({ error: deployment.message, code: "language_disabled" });
  const parseModel = process.env.GEMINI_PRESCRIPTION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 10000);
  try {
    const consultation = await clinicianConsultation(req, consultationId);
    if (!consultation) return res.status(404).json({ error: "No consultation was found." });
    const profileValidation = validateClinicalProfile(consultation.structured_record?.patient_profile);
    if (!profileValidation.valid) {
      return res.status(409).json({
        error: "This case has no complete, patient-confirmed prescribing context. Re-assess age, weight where required, allergies, medicines, pregnancy/lactation, and kidney/liver status before prescribing.",
        code: "patient_context_missing",
        fields: profileValidation.errors.map(({ field }) => field),
      });
    }

    const candidate = await parsePrescriptionTranscript({
      transcript,
      languageCode,
      apiKey: geminiApiKeys(),
      model: parseModel,
      signal: controller.signal,
    });
    const validation = validateParsedPrescription(candidate);
    const interaction = validation.valid
      ? checkPrescription(validation.prescription.drug, consultation.structured_record?.medication_history)
      : { conflicts: [], duplicate: false };
    const warning = validation.valid ? interactionWarning(interaction) : null;

    await recordAiProcessingEvent({
      consultationId,
      actorId: req.doctor.id,
      purpose: "prescription_draft_extraction",
      provider: "gemini",
      model: parseModel,
      promptVersion: PRESCRIPTION_PROMPT_VERSION,
      languageCode,
      inputHash: sha256(transcript),
      valid: validation.valid,
      errorCode: validation.valid ? null : "parse_invalid",
    });
    await recordAuditEvent({ action: "prescription.dictation_parsed", actorType: "clinician", actorId: req.doctor.id, consultationId, outcome: validation.valid ? "success" : "rejected", metadata: { ...safeRequestMetadata(req), provider: "sahara", parse_model: parseModel, prompt_version: PRESCRIPTION_PROMPT_VERSION, language_code: languageCode, speech_file_present: Boolean(speechFileId) } });
    if (!validation.valid) {
      return res.status(422).json({
        error: validation.errors[0]?.message || "The dictation could not be parsed safely; please type it.",
        code: "parse_invalid",
        transcript,
        errors: validation.errors,
      });
    }
    const clinicalContext = assessPrescriptionContext(validation.prescription.drug, profileValidation.profile);
    return res.json({
      transcript,
      prescription: validation.prescription,
      interaction,
      warning,
      clinical_context: { warnings: clinicalContext.warnings, allergy_match: clinicalContext.allergyMatch },
      language_safety: deployment,
    });
  } catch (error) {
    await recordAiProcessingEvent({ consultationId, actorId: req.doctor.id, purpose: "prescription_draft_extraction", provider: "gemini", model: parseModel, promptVersion: PRESCRIPTION_PROMPT_VERSION, languageCode, inputHash: sha256(transcript), valid: false, errorCode: controller.signal.aborted ? "timeout" : "provider_error" });
    const hint = missingColumnHint(error, "0009_prescription_dictation.sql");
    return res.status(hint ? 502 : controller.signal.aborted ? 504 : 502).json({ error: hint || (controller.signal.aborted ? "Prescription parsing timed out. Your transcript is preserved; please type it." : error.message) });
  } finally {
    clearTimeout(deadline);
  }
});

prescriptionsRouter.post("/", requireDoctor, async (req, res) => {
  const {
    consultation_id, drug, dosage, frequency = null, duration = null,
    instructions = "", acknowledged_interaction = false, dictated = false,
    raw_transcript = null, parse_confidence = null, confirmed_dictation = false,
    patient_factors_confirmed = false, acknowledged_clinical_context = false,
  } = req.body;
  if (!consultation_id || !String(drug || "").trim() || !String(dosage || "").trim()) return res.status(400).json({ error: "Drug and dosage are required." });
  try {
    const supabase = getSupabaseAdmin();
    // A clinician can only prescribe on a case in their own queue.
    const consultation = await clinicianConsultation(req, consultation_id);
    if (!consultation) return res.status(404).json({ error: "No consultation was found." });

    let values = { drug: String(drug).trim(), dosage: String(dosage).trim(), frequency, duration, instructions: String(instructions).trim(), confidence: parse_confidence };
    if (dictated) {
      if (!confirmed_dictation) return res.status(400).json({ error: "Review and confirm the dictated prescription before saving.", code: "confirmation_required" });
      const validation = validateParsedPrescription(values);
      if (!validation.valid) return res.status(422).json({ error: validation.errors[0].message, code: "parse_invalid", errors: validation.errors });
      if (!String(raw_transcript || "").trim()) return res.status(400).json({ error: "The original dictation transcript is required for audit." });
      values = validation.prescription;
    }

    const clinicalContext = assessPrescriptionContext(values.drug, consultation.structured_record?.patient_profile);
    if (!clinicalContext.valid) {
      return res.status(409).json({
        error: "This case is missing patient-confirmed prescribing details. Do not prescribe until age, weight where required, allergies, medicines, pregnancy/lactation, and kidney/liver status are re-assessed.",
        code: "patient_context_missing",
        fields: clinicalContext.errors.map(({ field }) => field),
      });
    }
    if (!patient_factors_confirmed) {
      return res.status(400).json({ error: "Confirm that you reviewed the patient factors before saving.", code: "patient_factors_confirmation_required" });
    }
    if (clinicalContext.allergyMatch) {
      return res.status(409).json({
        error: `Prescription blocked: the recorded drug allergy may match ${values.drug}. Review and correct the allergy record or choose a clinically appropriate medicine.`,
        code: "allergy_match",
        allergy: clinicalContext.allergyMatch,
      });
    }
    if (clinicalContext.warnings.length && !acknowledged_clinical_context) {
      return res.status(409).json({
        error: "Dose-relevant patient factors require review before this prescription can be saved.",
        code: "clinical_context",
        warnings: clinicalContext.warnings,
      });
    }

    // Checked against what the patient said they already take. The clinician can
    // always proceed — a blanket block would be its own kind of unsafe — but the
    // warning has to be read and acknowledged first, and the override is stored.
    const interaction = checkPrescription(values.drug, consultation.structured_record?.medication_history);
    const warning = interactionWarning(interaction);
    if (warning && !acknowledged_interaction) {
      return res.status(409).json({ error: warning, code: "interaction", interaction });
    }

    const { data, error } = await supabase.from("prescriptions").insert({
      consultation_id,
      doctor_id: req.doctor.id,
      drug: values.drug,
      dosage: values.dosage,
      frequency: values.frequency || null,
      duration: values.duration || null,
      instructions: values.instructions || null,
      interaction_override: warning ? interaction : null,
      patient_context_snapshot: clinicalContext.profile,
      patient_factors_confirmed: true,
      clinical_context_acknowledgement: clinicalContext.warnings.length ? {
        acknowledged: true,
        warnings: clinicalContext.warnings,
        acknowledged_at: new Date().toISOString(),
      } : null,
      dictated: Boolean(dictated),
      raw_transcript: dictated ? String(raw_transcript).trim() : null,
      parse_confidence: dictated ? values.confidence : null,
      parse_provider: dictated ? "gemini" : null,
      parse_model: dictated ? (process.env.GEMINI_PRESCRIPTION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite") : null,
      prompt_version: dictated ? PRESCRIPTION_PROMPT_VERSION : null,
    }).select("*").single();
    if (error) throw error;
    const { error: updateError } = await supabase.from("consultations").update({ status: "complete" }).eq("id", consultation_id);
    if (updateError) { await supabase.from("prescriptions").delete().eq("id", data.id); throw updateError; }
    await recordAuditEvent({ action: warning || clinicalContext.warnings.length ? "prescription.saved_with_override" : "prescription.saved", actorType: "clinician", actorId: req.doctor.id, consultationId: consultation_id, metadata: { ...safeRequestMetadata(req), dictated: Boolean(dictated), interaction_acknowledged: Boolean(warning), clinical_context_acknowledged: clinicalContext.warnings.length > 0, patient_factors_confirmed: true } });
    res.status(201).json({ prescription: data });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0011_clinical_prescribing_context.sql") || error.message }); }
});
