import { describe, expect, it } from "vitest";
import { normalizePhone, validatePatient } from "./patients.js";

describe("patient registration validation", () => {
  it("requires a full name", () => {
    expect(validatePatient("A", "08012345678")).toMatch(/full name/i);
  });

  it("accepts a valid local or international phone number", () => {
    expect(validatePatient("Amina Yusuf", "0801 234 5678")).toBeNull();
    expect(validatePatient("Amina Yusuf", "+2348012345678")).toBeNull();
  });

  it("normalizes Nigerian international numbers for exact lookup", () => {
    expect(normalizePhone("+234 801 234 5678")).toBe("08012345678");
    expect(normalizePhone("0801-234-5678")).toBe("08012345678");
  });

  it("requires a complete phone number so the patient can retrieve the record safely", () => {
    expect(validatePatient("Amina Yusuf", "")).toMatch(/complete phone/i);
  });
});
