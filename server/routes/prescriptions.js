import { Router } from "express";
import { getSupabaseAdmin, requireDoctor } from "../supabaseAdmin.js";
import { canWorkCase } from "../careRouting.js";
import { checkPrescription, interactionWarning } from "../medicationSafety.js";
import { missingColumnHint } from "../schemaHints.js";

export const prescriptionsRouter = Router();

prescriptionsRouter.post("/", requireDoctor, async (req, res) => {
  const { consultation_id, drug, dosage, instructions = "", acknowledged_interaction = false } = req.body;
  if (!consultation_id || !String(drug || "").trim() || !String(dosage || "").trim()) return res.status(400).json({ error: "Drug and dosage are required." });
  try {
    const supabase = getSupabaseAdmin();
    // A clinician can only prescribe on a case in their own queue.
    const { data: consultation } = await supabase.from("consultations").select("assigned_tier,structured_record").eq("id", consultation_id).maybeSingle();
    if (!consultation || !canWorkCase(req.doctor.role, consultation.assigned_tier)) return res.status(404).json({ error: "No consultation was found." });

    // Checked against what the patient said they already take. The clinician can
    // always proceed — a blanket block would be its own kind of unsafe — but the
    // warning has to be read and acknowledged first, and the override is stored.
    const interaction = checkPrescription(drug, consultation.structured_record?.medication_history);
    const warning = interactionWarning(interaction);
    if (warning && !acknowledged_interaction) {
      return res.status(409).json({ error: warning, code: "interaction", interaction });
    }

    const { data, error } = await supabase.from("prescriptions").insert({
      consultation_id,
      doctor_id: req.doctor.id,
      drug: drug.trim(),
      dosage: dosage.trim(),
      instructions: instructions.trim() || null,
      interaction_override: warning ? interaction : null,
    }).select("*").single();
    if (error) throw error;
    const { error: updateError } = await supabase.from("consultations").update({ status: "complete" }).eq("id", consultation_id);
    if (updateError) { await supabase.from("prescriptions").delete().eq("id", data.id); throw updateError; }
    res.status(201).json({ prescription: data });
  } catch (error) { res.status(502).json({ error: missingColumnHint(error, "0005_prescription_safety.sql") || error.message }); }
});
