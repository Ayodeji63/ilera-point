import { describe, expect, it } from "vitest";
import { adminAccessDecision, applicationRecord, describeDirectoryFailure, doctorAccessDecision, validateApplication } from "./doctorAccess.js";

describe("doctor access", () => {
  it("admits an approved doctor", () => {
    expect(doctorAccessDecision({ status: "approved", role: "doctor" })).toMatchObject({ allowed: true });
  });

  it("keeps an applicant out until an administrator approves them", () => {
    expect(doctorAccessDecision({ status: "pending" })).toMatchObject({ allowed: false, status: 403, code: "pending" });
  });

  it("keeps a rejected applicant out", () => {
    expect(doctorAccessDecision({ status: "rejected" })).toMatchObject({ allowed: false, code: "rejected" });
  });

  it("keeps out an authenticated account that never applied", () => {
    expect(doctorAccessDecision(null)).toMatchObject({ allowed: false, code: "unregistered" });
    expect(doctorAccessDecision(undefined)).toMatchObject({ allowed: false, code: "unregistered" });
  });

  it("fails closed on a status it does not recognise", () => {
    // A typo, a half-applied migration, or a future status must never read as
    // permission to open a patient's record.
    for (const status of ["APPROVED", "approved ", "active", "", null, undefined, true]) {
      expect(doctorAccessDecision({ status })).toMatchObject({ allowed: false });
    }
  });

  it("always files an application as a pending doctor", () => {
    // Whatever the applicant sent, the stored row is pending and non-admin, and
    // the email is the one the token proved.
    expect(applicationRecord({ email: "verified@example.com", name: "Dr Okonkwo", licenceNumber: "MDCN/R/1" }))
      .toEqual({ name: "Dr Okonkwo", email: "verified@example.com", licence_number: "MDCN/R/1", status: "pending", role: "doctor" });
  });

  it("requires a name and a registration number", () => {
    expect(validateApplication({ name: "D", licenceNumber: "MDCN/R/1" })).toMatch(/name/i);
    expect(validateApplication({ name: "Dr Okonkwo", licenceNumber: "" })).toMatch(/registration/i);
    expect(validateApplication({ name: "x".repeat(121), licenceNumber: "MDCN/R/1" })).toMatch(/name/i);
    expect(validateApplication({ name: "Dr Okonkwo", licenceNumber: "MDCN/R/1" })).toBeNull();
  });

  it("only lets an approved admin review applications", () => {
    expect(adminAccessDecision({ status: "approved", role: "admin" })).toMatchObject({ allowed: true });
    expect(adminAccessDecision({ status: "approved", role: "doctor" })).toMatchObject({ allowed: false, code: "not_admin" });
    expect(adminAccessDecision({ status: "pending", role: "admin" })).toMatchObject({ allowed: false, code: "pending" });
    expect(adminAccessDecision({ status: "approved" })).toMatchObject({ allowed: false, code: "not_admin" });
  });

  it("names the missing migration instead of reporting a bare gateway error", () => {
    expect(describeDirectoryFailure({ code: "42703", message: "column doctors.status does not exist" }))
      .toMatch(/0002_doctor_onboarding\.sql/);
    expect(describeDirectoryFailure({ code: "08006", message: "connection failure" }))
      .toBe("The doctor directory could not be read.");
  });
});
