import { Router } from "express";
import { getSupabaseAdmin } from "../supabaseAdmin.js";

export const patientsRouter = Router();

function patientView(patient) {
  return { id: patient.id, name: patient.name, phone: patient.phone };
}

export function validatePatient(name, phone) {
  if (name.length < 2) return "Enter the patient's full name.";
  if (phone && !/^[+\d][\d\s()-]{6,20}$/.test(phone)) return "Enter a valid phone number.";
  return null;
}

patientsRouter.post("/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();
  const validationError = validatePatient(name, phone);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("patients")
      .insert({ name, phone: phone || null })
      .select("id,name,phone")
      .single();
    if (error) throw error;
    return res.status(201).json({ patient: patientView(data) });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

patientsRouter.get("/lookup", async (req, res) => {
  const name = String(req.query.name || "").trim();
  const phone = String(req.query.phone || "").replace(/\s/g, "").trim();
  if (name.length < 2 && phone.length < 4) return res.status(400).json({ error: "Enter a name or phone number." });

  try {
    let query = getSupabaseAdmin().from("patients").select("id,name,phone").limit(8);
    if (phone.length >= 4) query = query.ilike("phone", `%${phone}%`);
    else query = query.ilike("name", `%${name}%`);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ patients: data.map(patientView) });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});
