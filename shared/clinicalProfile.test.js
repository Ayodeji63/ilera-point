import { describe, expect, it } from "vitest";
import { assessPrescriptionContext, medicationHistoryFromProfile, validateClinicalProfile } from "./clinicalProfile.js";

const complete = (overrides = {}) => ({
  age_value: 32, age_unit: "years", weight_kg: 70, sex_at_birth: "female",
  state_of_residence: "Lagos", pregnancy_status: "not_pregnant", lactation_status: "not_breastfeeding",
  drug_allergy_status: "none_known", drug_allergy_details: "", medication_status: "none",
  current_medications: "", kidney_disease_status: "no", liver_disease_status: "no",
  other_conditions: "", confirmed_by_patient: true, confirmed_at: "2026-09-15T10:00:00.000Z",
  ...overrides,
});

describe("clinical profile", () => {
  it("treats a missing profile as incomplete instead of throwing", () => {
    expect(validateClinicalProfile(null)).toMatchObject({ valid: false });
  });

  it("requires weight for a child and preserves an explicit unknown status", () => {
    const result = validateClinicalProfile(complete({ age_value: 8, weight_kg: null, medication_status: "unknown" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "weight_kg" }));
  });

  it("does not turn an unknown medication list into none", () => {
    expect(medicationHistoryFromProfile(complete({ medication_status: "unknown" }))).toBe("");
    expect(medicationHistoryFromProfile(complete({ medication_status: "none" }))).toBe("None reported");
  });

  it("hard-matches a penicillin allergy to amoxicillin", () => {
    const result = assessPrescriptionContext("Amoxicillin", complete({ drug_allergy_status: "known", drug_allergy_details: "Penicillin caused facial swelling" }));
    expect(result.allergyMatch).toMatch(/Penicillin/);
  });

  it("surfaces dose-relevant uncertainty for clinician acknowledgement", () => {
    const result = assessPrescriptionContext("Paracetamol", complete({ pregnancy_status: "unknown", kidney_disease_status: "unknown" }));
    expect(result.warnings.join(" ")).toMatch(/Pregnancy status/i);
    expect(result.warnings.join(" ")).toMatch(/renal/i);
  });
});
