import { describe, expect, it } from "vitest";
import {
  collectionView,
  createPatientReturnCode,
  createPatientToken,
  hashPatientReturnCode,
  hashPatientToken,
  normalizePatientReturnCode,
  patientTokenMatches,
} from "./consultationAccess.js";

const prescription = { drug: "Paracetamol", dosage: "500 mg twice daily", instructions: "After food" };

describe("patient collection token", () => {
  it("issues an unguessable token that differs every time", () => {
    const first = createPatientToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(createPatientToken()).not.toBe(first);
  });

  it("accepts only the exact token", () => {
    const token = createPatientToken();
    // Flip the last character to something it definitely is not, rather than to
    // a fixed digit it might already be.
    const nearMiss = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");
    const storedHash = hashPatientToken(token);
    expect(storedHash).not.toBe(token);
    expect(patientTokenMatches(storedHash, token)).toBe(true);
    expect(patientTokenMatches(storedHash, nearMiss)).toBe(false);
    expect(patientTokenMatches(storedHash, token.slice(0, -1))).toBe(false);
    expect(patientTokenMatches(storedHash, "")).toBe(false);
    expect(patientTokenMatches("", "")).toBe(false);
    expect(patientTokenMatches(storedHash, undefined)).toBe(false);
    expect(patientTokenMatches(null, token)).toBe(false);
  });
});

describe("patient return code", () => {
  it("issues a readable high-entropy code without ambiguous characters", () => {
    const code = createPatientReturnCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/);
    expect(createPatientReturnCode()).not.toBe(code);
  });

  it("normalizes spacing, case, and separators before hashing", () => {
    expect(normalizePatientReturnCode("abcd efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(hashPatientReturnCode("ABCD-EFGH-JKMN")).toBe(hashPatientReturnCode("abcd efgh jkmn"));
  });
});

describe("what the waiting patient may see", () => {
  it("hides the prescription while the case is still pending", () => {
    expect(collectionView({ status: "pending" }, prescription)).toMatchObject({ finished: false, prescription: null });
  });

  it("releases the prescription once the clinician has completed the case", () => {
    expect(collectionView({ status: "complete" }, prescription)).toMatchObject({
      finished: true,
      prescription: { drug: "Paracetamol", dosage: "500 mg twice daily", instructions: "After food" },
    });
  });

  it("reports a finished case that carries no prescription", () => {
    expect(collectionView({ status: "reviewed" }, null)).toMatchObject({ finished: true, prescription: null });
    expect(collectionView({ status: "flagged" }, null)).toMatchObject({ finished: true, prescription: null });
  });

  it("returns nothing for a consultation that does not exist", () => {
    expect(collectionView(null, prescription)).toBeNull();
  });
});
