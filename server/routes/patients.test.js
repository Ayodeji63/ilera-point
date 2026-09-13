import { describe, expect, it } from "vitest";
import { validatePatient } from "./patients.js";

describe("patient registration validation", () => {
  it("requires a full name", () => {
    expect(validatePatient("A", "08012345678")).toMatch(/full name/i);
  });

  it("accepts a valid local or international phone number", () => {
    expect(validatePatient("Amina Yusuf", "0801 234 5678")).toBeNull();
    expect(validatePatient("Amina Yusuf", "+2348012345678")).toBeNull();
  });

  it("allows registration without a phone number", () => {
    expect(validatePatient("Amina Yusuf", "")).toBeNull();
  });
});
