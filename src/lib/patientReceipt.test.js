import { describe, expect, it } from "vitest";
import { clearPatientReceipt, readPatientReceipt, savePatientReceipt } from "./patientReceipt.js";

function storageDouble() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("active patient receipt", () => {
  it("keeps only the opaque result capability needed after a refresh", () => {
    const storage = storageDouble();
    savePatientReceipt({ id: "visit-1", patient_token: "secret", patient_return_code: "ABCD-EFGH-JKMN", patient_result_expires_at: "2026-09-22T00:00:00.000Z" }, "yo", storage, true);
    expect(readPatientReceipt(storage, Date.parse("2026-09-16T00:00:00.000Z"))).toEqual({
      id: "visit-1", patient_token: "secret", patient_return_code: "ABCD-EFGH-JKMN", patient_result_expires_at: "2026-09-22T00:00:00.000Z", language: "yo", optional_consent_active: true,
    });
  });

  it("rejects and clears an expired receipt", () => {
    const storage = storageDouble();
    savePatientReceipt({ id: "visit-1", patient_token: "secret", patient_result_expires_at: "2026-09-15T00:00:00.000Z" }, "en", storage);
    expect(readPatientReceipt(storage, Date.parse("2026-09-16T00:00:00.000Z"))).toBeNull();
  });

  it("clears the receipt when the patient finishes", () => {
    const storage = storageDouble();
    savePatientReceipt({ id: "visit-1", patient_token: "secret", patient_result_expires_at: "2026-09-22T00:00:00.000Z" }, "en", storage);
    clearPatientReceipt(storage);
    expect(readPatientReceipt(storage)).toBeNull();
  });
});
