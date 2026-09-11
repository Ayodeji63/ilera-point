import { describe, expect, it } from "vitest";
import { checkPrescription, interactionWarning } from "./medicationSafety.js";

describe("prescription interaction check", () => {
  it("catches an NSAID prescribed to a patient on warfarin", () => {
    const result = checkPrescription("Ibuprofen 400mg", "Takes warfarin daily for a clot");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ taking: "warfarin", prescribed: "ibuprofen" });
    expect(interactionWarning(result)).toMatch(/bleeding/i);
  });

  it("catches an antibiotic that raises INR on warfarin", () => {
    expect(checkPrescription("Metronidazole", "warfarin").conflicts).toHaveLength(1);
  });

  it("catches potassium risk on an ACE inhibitor", () => {
    expect(checkPrescription("Spironolactone 25mg", "on lisinopril for blood pressure").conflicts[0].risk)
      .toMatch(/potassium/i);
  });

  it("stays quiet when nothing interacts", () => {
    const result = checkPrescription("Paracetamol 500mg", "Takes warfarin daily");
    expect(result.conflicts).toEqual([]);
    expect(interactionWarning(result)).toBeNull();
  });

  it("stays quiet when the patient reports no medication", () => {
    expect(checkPrescription("Ibuprofen", "").conflicts).toEqual([]);
    expect(checkPrescription("Ibuprofen", null).conflicts).toEqual([]);
    expect(checkPrescription("", "warfarin").conflicts).toEqual([]);
  });

  it("flags prescribing what the patient already takes", () => {
    expect(checkPrescription("Metformin 500mg", "Takes metformin twice daily").duplicate).toBe(true);
    expect(checkPrescription("Amoxicillin", "Takes metformin twice daily").duplicate).toBe(false);
  });

  it("matches a drug name at a word boundary, not buried inside another word", () => {
    // Trailing text is expected and must still match — prescriptions carry salts
    // and strengths ("warfarin sodium", "ibuprofen 400mg").
    expect(checkPrescription("Ibuprofen 400mg", "warfarin sodium 5mg").conflicts).toHaveLength(1);
    // But a term appearing mid-word is not that drug.
    expect(checkPrescription("Ibuprofen", "patient takes nonwarfarin herbal remedy").conflicts).toEqual([]);
  });

  it("is unaffected by casing and dosage text around the drug name", () => {
    expect(checkPrescription("DICLOFENAC 50 mg twice daily", "Warfarin 5mg").conflicts).toHaveLength(1);
  });

  it("reports every conflict it finds, not just the first", () => {
    const result = checkPrescription("Cotrimoxazole", "takes warfarin and methotrexate");
    expect(result.conflicts.length).toBeGreaterThan(1);
  });
});
