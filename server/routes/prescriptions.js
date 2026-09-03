import { Router } from "express";
import { getSupabaseAdmin, requireDoctor } from "../supabaseAdmin.js";

export const prescriptionsRouter = Router();

prescriptionsRouter.post("/", requireDoctor, async (req, res) => {
  const { consultation_id, drug, dosage, instructions = "" } = req.body;
  if (!consultation_id || !String(drug || "").trim() || !String(dosage || "").trim()) return res.status(400).json({ error: "Drug and dosage are required." });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("prescriptions").insert({ consultation_id, doctor_id: req.doctor.id, drug: drug.trim(), dosage: dosage.trim(), instructions: instructions.trim() || null }).select("*").single();
    if (error) throw error;
    const { error: updateError } = await supabase.from("consultations").update({ status: "complete" }).eq("id", consultation_id);
    if (updateError) { await supabase.from("prescriptions").delete().eq("id", data.id); throw updateError; }
    res.status(201).json({ prescription: data });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
