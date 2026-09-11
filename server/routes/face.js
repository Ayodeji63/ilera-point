import { Router } from "express";
import { getSupabaseAdmin } from "../supabaseAdmin.js";
import { enrollFace, FaceInputError, normalizeFaceImage, searchFace, verifyFace } from "../tencentFace.js";

export const faceRouter = Router();

function patientView(patient) { return { id: patient.id, name: patient.name, phone: patient.phone }; }
function faceError(error) { return { error: error.message, providerCode: error.providerCode, requestId: error.requestId }; }

function validatePatient(name, phone) {
  if (name.length < 2) return "Enter the patient's full name.";
  if (phone && !/^[+\d][\d\s()-]{6,20}$/.test(phone)) return "Enter a valid phone number.";
  return null;
}

faceRouter.post("/identify", async (req, res) => {
  try {
    const match = await searchFace(normalizeFaceImage(req.body.imageB64));
    // An uncertain or ambiguous result is reported as no match, so the kiosk
    // offers manual lookup instead of opening someone else's record.
    if (!match.matched) return res.json({ patient: null, reason: match.reason });
    const { data: patient, error } = await getSupabaseAdmin().from("patients").select("id,name,phone").eq("id", match.patientId).maybeSingle();
    if (error) throw error;
    if (!patient) return res.json({ patient: null, reason: "unknown_patient" });
    res.json({ patient: patientView(patient), confidence: match.score });
  } catch (error) { res.status(error instanceof FaceInputError ? 400 : 502).json(faceError(error)); }
});

faceRouter.post("/enroll", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();
  const validationError = validatePatient(name, phone);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const image = normalizeFaceImage(req.body.imageB64);
    const supabase = getSupabaseAdmin();
    const { data: patient, error } = await supabase.from("patients").insert({ name, phone: phone || null }).select("id,name,phone").single();
    if (error) throw error;
    try {
      await enrollFace(patient.id, name, image);
    } catch (enrollError) {
      // Never leave a patient row behind that no face can ever match.
      await supabase.from("patients").delete().eq("id", patient.id);
      throw enrollError;
    }
    const { error: updateError } = await supabase.from("patients").update({ face_person_id: patient.id }).eq("id", patient.id);
    if (updateError) throw updateError;
    return res.status(201).json({ patient: patientView(patient) });
  } catch (error) { return res.status(error instanceof FaceInputError ? 400 : 502).json(faceError(error)); }
});

faceRouter.post("/manual-register", async (req, res) => {
  const name = String(req.body.name || "").trim(); const phone = String(req.body.phone || "").trim();
  const validationError = validatePatient(name, phone);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const { data, error } = await getSupabaseAdmin().from("patients").insert({ name, phone: phone || null }).select("id,name,phone").single();
    if (error) throw error;
    return res.status(201).json({ patient: patientView(data) });
  } catch (error) { return res.status(502).json({ error: error.message }); }
});

faceRouter.post("/compare", async (req, res) => {
  const patientId = String(req.body.patientId || "");
  if (!patientId) return res.status(400).json({ error: "A patient is required for comparison." });
  try { return res.json(await verifyFace(patientId, req.body.imageB64)); }
  catch (error) { return res.status(error instanceof FaceInputError ? 400 : 502).json(faceError(error)); }
});

faceRouter.get("/manual-lookup", async (req, res) => {
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
