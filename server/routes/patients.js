import { Router } from "express";
import { getSupabaseAdmin } from "../supabaseAdmin.js";
import { missingColumnHint } from "../schemaHints.js";

export const patientsRouter = Router();
const lookupBuckets = new Map();
const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const LOOKUP_LIMIT = Number.parseInt(process.env.PATIENT_LOOKUP_RATE_LIMIT || "10", 10);

export function normalizePhone(phone) {
  const value = String(phone || "").replace(/[^\d+]/g, "");
  if (value.startsWith("+234")) return `0${value.slice(4)}`;
  if (value.startsWith("234")) return `0${value.slice(3)}`;
  return value;
}

function maskPhone(phone) {
  const value = normalizePhone(phone);
  return value.length > 4 ? `${"•".repeat(Math.min(7, value.length - 4))}${value.slice(-4)}` : "Phone verified";
}

function patientView(patient, { mask = false } = {}) {
  return { id: patient.id, name: patient.name, phone: mask ? maskPhone(patient.phone) : patient.phone };
}

function permitLookup(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = lookupBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= LOOKUP_WINDOW_MS) lookupBuckets.set(key, { startedAt: now, count: 1 });
  else if (++bucket.count > LOOKUP_LIMIT) {
    res.set("Retry-After", String(Math.ceil((LOOKUP_WINDOW_MS - (now - bucket.startedAt)) / 1000)));
    return res.status(429).json({ error: "Too many record searches. Please wait or ask a health worker for help." });
  }
  if (lookupBuckets.size > 1000) lookupBuckets.delete(lookupBuckets.keys().next().value);
  next();
}

export function validatePatient(name, phone) {
  if (name.length < 2) return "Enter the patient's full name.";
  if (!phone || !/^[+\d][\d\s()-]{6,20}$/.test(phone) || normalizePhone(phone).length < 10) return "Enter a complete phone number.";
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
      .insert({ name, phone, phone_normalized: normalizePhone(phone) })
      .select("id,name,phone")
      .single();
    if (error) throw error;
    return res.status(201).json({ patient: patientView(data) });
  } catch (error) {
    return res.status(502).json({ error: missingColumnHint(error, "0010_ethics_privacy.sql") || error.message });
  }
});

patientsRouter.get("/lookup", permitLookup, async (req, res) => {
  const name = String(req.query.name || "").trim();
  const phone = normalizePhone(req.query.phone);
  if (phone.length < 10) return res.status(400).json({ error: "Enter the complete phone number on the patient record." });

  try {
    const query = getSupabaseAdmin().from("patients").select("id,name,phone").eq("phone_normalized", phone).limit(3);
    const { data, error } = await query;
    if (error) throw error;
    const exactName = name.toLocaleLowerCase().trim();
    const matches = exactName ? data.filter((patient) => patient.name.toLocaleLowerCase().trim() === exactName) : data;
    return res.json({ patients: matches.map((patient) => patientView(patient, { mask: true })) });
  } catch (error) {
    return res.status(502).json({ error: missingColumnHint(error, "0010_ethics_privacy.sql") || error.message });
  }
});
