import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const patientProfile = {
  age_value: 32, age_unit: "years", weight_kg: 70, sex_at_birth: "female", state_of_residence: "Lagos",
  pregnancy_status: "not_pregnant", lactation_status: "not_breastfeeding", drug_allergy_status: "none_known",
  drug_allergy_details: "", medication_status: "current", current_medications: "warfarin daily",
  kidney_disease_status: "no", liver_disease_status: "no", other_conditions: "", confirmed_by_patient: true,
  confirmed_at: "2026-09-15T10:00:00.000Z",
};
const mocks = vi.hoisted(() => ({ parse: vi.fn(), tables: [], profile: null }));

vi.mock("../prescriptionParse.js", async (importOriginal) => ({
  ...await importOriginal(),
  parsePrescriptionTranscript: mocks.parse,
}));

vi.mock("../supabaseAdmin.js", () => ({
  requireDoctor: (req, _res, next) => { req.doctor = { id: "doctor-1", role: "doctor" }; next(); },
  getSupabaseAdmin: () => ({
    from: (table) => {
      mocks.tables.push(table);
      if (table === "consultations") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { assigned_tier: "doctor", structured_record: { medication_history: "warfarin daily", patient_profile: mocks.profile } }, error: null }) }) }),
      };
      if (table === "benchmark_samples") return {
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: "sample-1" }, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      if (table === "audit_events" || table === "ai_processing_events") return {
        insert: async () => ({ error: null }),
      };
      if (table === "prescriptions") return {
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: "prescription-1" }, error: null }) }) }),
      };
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { prescriptionsRouter } from "./prescriptions.js";

let server; let origin;
beforeAll(async () => {
  process.env.GEMINI_API_KEY = "test";
  const app = express(); app.use(express.json()); app.use("/api/prescriptions", prescriptionsRouter);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => { delete process.env.GEMINI_API_KEY; return new Promise((resolve) => server.close(resolve)); });
beforeEach(() => { vi.clearAllMocks(); mocks.tables.length = 0; mocks.profile = patientProfile; });

describe("prescription dictation routes", () => {
  it("returns a checked draft without writing a prescription", async () => {
    mocks.parse.mockResolvedValue({ drug: "Paracetamol", dosage: "500 mg", frequency: "TDS", duration: "5 days", instructions: "After food", confidence: 0.9 });
    const response = await fetch(`${origin}/api/prescriptions/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultation_id: "case-1", transcript: "Paracetamol 500 mg TDS for 5 days after food", language_code: "en" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ prescription: { drug: "Paracetamol", frequency: "TDS" } });
    expect(mocks.tables).not.toContain("benchmark_samples");
    expect(mocks.tables).not.toContain("prescriptions");
  });

  it("refuses an unrecognised model guess without copying clinical data into the benchmark dataset", async () => {
    mocks.parse.mockResolvedValue({ drug: "Paracetmol", dosage: "500 mg", frequency: "TDS", duration: "5 days", instructions: "After food", confidence: 0.4 });
    const response = await fetch(`${origin}/api/prescriptions/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultation_id: "case-1", transcript: "Paracetmol 500 mg", language_code: "yo" }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "parse_invalid", errors: [expect.objectContaining({ field: "drug" })] });
    expect(mocks.tables).not.toContain("benchmark_samples");
    expect(mocks.tables).toContain("ai_processing_events");
    expect(mocks.tables).not.toContain("prescriptions");
  });

  it("will not save a dictated payload without explicit confirmation", async () => {
    const response = await fetch(`${origin}/api/prescriptions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultation_id: "case-1", drug: "Paracetamol", dosage: "500 mg", frequency: "TDS", duration: "5 days", instructions: "After food", parse_confidence: 0.9, raw_transcript: "Paracetamol 500 mg", dictated: true }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "confirmation_required" });
    expect(mocks.tables).not.toContain("prescriptions");
  });

  it("refuses to parse an older case with no confirmed patient context", async () => {
    mocks.profile = null;
    const response = await fetch(`${origin}/api/prescriptions/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultation_id: "case-1", transcript: "Paracetamol 500 mg TDS for 5 days", language_code: "en" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "patient_context_missing" });
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("requires explicit clinician confirmation of patient factors before writing", async () => {
    const response = await fetch(`${origin}/api/prescriptions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultation_id: "case-1", drug: "Paracetamol", dosage: "500 mg" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "patient_factors_confirmation_required" });
    expect(mocks.tables).not.toContain("prescriptions");
  });

  it("blocks a prescription that matches a recorded drug allergy", async () => {
    mocks.profile = { ...patientProfile, drug_allergy_status: "known", drug_allergy_details: "Penicillin caused facial swelling" };
    const response = await fetch(`${origin}/api/prescriptions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultation_id: "case-1", drug: "Amoxicillin", dosage: "500 mg", patient_factors_confirmed: true }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "allergy_match" });
    expect(mocks.tables).not.toContain("prescriptions");
  });
});
