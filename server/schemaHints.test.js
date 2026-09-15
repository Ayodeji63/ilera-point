import { describe, expect, it } from "vitest";
import { missingColumnHint } from "./schemaHints.js";

describe("missingColumnHint", () => {
  it("names the migration to run when a column is absent", () => {
    expect(missingColumnHint({ code: "42703", message: "column consultations.patient_token does not exist" }, "0003_patient_collection.sql"))
      .toMatch(/0003_patient_collection\.sql/);
  });

  it("does not leak the column name to the caller", () => {
    expect(missingColumnHint({ code: "42703", message: "column consultations.patient_token does not exist" }, "0003.sql"))
      .not.toMatch(/patient_token/);
  });

  it("maps Supabase schema-cache errors to the migration that owns the column", () => {
    expect(missingColumnHint({ code: "PGRST204", message: "Could not find the 'interaction_override' column of 'prescriptions' in the schema cache" }, "0010_ethics_privacy.sql"))
      .toMatch(/0011_clinical_prescribing_context\.sql/);
  });

  it("points resumable result access to its migration", () => {
    expect(missingColumnHint({ code: "PGRST204", message: "Could not find the 'patient_return_code_hash' column of 'consultations' in the schema cache" }, "0010_ethics_privacy.sql"))
      .toMatch(/0012_patient_result_return\.sql/);
  });

  it("stays out of the way of unrelated failures", () => {
    expect(missingColumnHint({ code: "08006", message: "connection failure" }, "0003.sql")).toBeNull();
    expect(missingColumnHint(null, "0003.sql")).toBeNull();
  });
});
