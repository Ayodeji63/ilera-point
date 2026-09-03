import { Router } from "express";
import { getSupabaseAdmin } from "../supabaseAdmin.js";
import { comparePalm, normalizePalmImage, PalmInputError, registerPalm, searchPalm } from "../tencentPalm.js";

export const palmRouter = Router();

function patientView(patient) { return { id: patient.id, name: patient.name, phone: patient.phone }; }
function palmError(error) { return { error: error.message, providerCode: error.providerCode, requestId: error.requestId }; }

function validatePatient(name, phone) {
  if (name.length < 2) return "Enter the patient's full name.";
  if (phone && !/^[+\d][\d\s()-]{6,20}$/.test(phone)) return "Enter a valid phone number.";
  return null;
}

palmRouter.post("/identify", async (req, res) => {
  try {
    const result = await searchPalm(normalizePalmImage(req.body.imageB64));
    if (!result) return res.json({ patient: null });
    const { data: patient, error } = await getSupabaseAdmin().from("patients").select("id,name,phone").eq("id", result.patientId).maybeSingle();
    if (error) throw error;
    if (!patient) return res.json({ patient: null });
    res.json({ patient: patientView(patient), confidence: result.confidence });
  } catch (error) { res.status(error instanceof PalmInputError ? 400 : 502).json(palmError(error)); }
});

palmRouter.post("/enroll", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();
  const validationError = validatePatient(name, phone);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const image = normalizePalmImage(req.body.imageB64);
    const supabase = getSupabaseAdmin();
    const { data: patient, error } = await supabase.from("patients").insert({ name, phone: phone || null }).select("id,name,phone").single();
    if (error) throw error;
    let registered;
    try { registered = await registerPalm(patient.id, image); }
    catch (error) {
      await supabase.from("patients").delete().eq("id", patient.id);
      throw error;
    }
    const { error: updateError } = await supabase.from("patients").update({ palm_reference: registered.palmId }).eq("id", patient.id);
    if (updateError) throw updateError;
    return res.status(201).json({ patient: patientView(patient) });
  } catch (error) { return res.status(error instanceof PalmInputError ? 400 : 502).json(palmError(error)); }
});

palmRouter.post("/manual-register", async (req, res) => {
  const name = String(req.body.name || "").trim(); const phone = String(req.body.phone || "").trim();
  const validationError = validatePatient(name, phone);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const { data, error } = await getSupabaseAdmin().from("patients").insert({ name, phone: phone || null }).select("id,name,phone").single();
    if (error) throw error;
    return res.status(201).json({ patient: patientView(data) });
  } catch (error) { return res.status(502).json({ error: error.message }); }
});

palmRouter.post("/compare", async (req, res) => {
  const patientId = String(req.body.patientId || "");
  if (!patientId) return res.status(400).json({ error: "A patient is required for comparison." });
  try { return res.json(await comparePalm(patientId, req.body.imageB64)); }
  catch (error) { return res.status(error instanceof PalmInputError ? 400 : 502).json(palmError(error)); }
});

palmRouter.get("/manual-lookup", async (req, res) => {
  const name = String(req.query.name || "").trim();
  const phone = String(req.query.phone || "").replace(/\s/g, "").trim();
  if (name.length < 2 && phone.length < 4) return res.status(400).json({ error: "Enter a name or phone number." });
  try {
    let query = getSupabaseAdmin().from("patients").select("id,name,phone").limit(8);
    if (phone.length >= 4) query = query.ilike("phone", `%${phone}%`);
    else query = query.ilike("name", `%${name}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ patients: data.map(patientView) });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
