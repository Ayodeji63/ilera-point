import { Router } from "express";
import { getSupabaseAdmin, requireDoctor } from "../supabaseAdmin.js";
import { canWorkCase } from "../careRouting.js";
import { checkPrescription, interactionWarning } from "../medicationSafety.js";
import { missingColumnHint } from "../schemaHints.js";
import { parsePrescriptionTranscript, validateParsedPrescription } from "../prescriptionParse.js";
import { geminiApiKeys, hasGeminiApiKeys } from "../geminiClient.js";

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

  let sampleId = null;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 10000);
  try {
    const consultation = await clinicianConsultation(req, consultationId);
    if (!consultation) return res.status(404).json({ error: "No consultation was found." });

    // Persist the verbatim ASR output before invoking Gemini. Every dictation is
    // therefore auditable even when parsing fails or times out.
    const { data: sample, error: sampleError } = await getSupabaseAdmin().from("benchmark_samples").insert({
      consultation_id: consultationId,
      doctor_id: req.doctor.id,
      language_code: languageCode,
      speech_file_id: speechFileId,
      raw_transcript: transcript,
      provider: "sahara",
    }).select("id").single();
    if (sampleError) throw sampleError;
    sampleId = sample.id;

    const candidate = await parsePrescriptionTranscript({
      transcript,
      languageCode,
      apiKey: geminiApiKeys(),
      model: process.env.GEMINI_PRESCRIPTION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      signal: controller.signal,
    });
    const validation = validateParsedPrescription(candidate);
    const interaction = validation.valid
      ? checkPrescription(validation.prescription.drug, consultation.structured_record?.medication_history)
      : { conflicts: [], duplicate: false };
    const warning = validation.valid ? interactionWarning(interaction) : null;

    const { error: updateError } = await getSupabaseAdmin().from("benchmark_samples").update({
      parsed_output: candidate,
      valid: validation.valid,
      validation_errors: validation.errors,
    }).eq("id", sampleId);
    if (updateError) throw updateError;

    console.info("[benchmark] prescription dictation", { sampleId, languageCode, valid: validation.valid });
    if (!validation.valid) {
      return res.status(422).json({
        error: validation.errors[0]?.message || "The dictation could not be parsed safely; please type it.",
        code: "parse_invalid",
        transcript,
        errors: validation.errors,
      });
    }
    return res.json({ transcript, prescription: validation.prescription, interaction, warning, sample_id: sampleId });
  } catch (error) {
    if (sampleId) {
      await getSupabaseAdmin().from("benchmark_samples").update({ valid: false, validation_errors: [{ field: "model", message: "Parsing failed." }] }).eq("id", sampleId);
    }
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
      dictated: Boolean(dictated),
      raw_transcript: dictated ? String(raw_transcript).trim() : null,
      parse_confidence: dictated ? values.confidence : null,
    }).select("*").single();
    if (error) throw error;
    const { error: updateError } = await supabase.from("consultations").update({ status: "complete" }).eq("id", consultation_id);
    if (updateError) { await supabase.from("prescriptions").delete().eq("id", data.id); throw updateError; }
    res.status(201).json({ prescription: data });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0009_prescription_dictation.sql") || missingColumnHint(error, "0005_prescription_safety.sql") || error.message }); }
});
