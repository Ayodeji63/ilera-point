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

  it("stays out of the way of unrelated failures", () => {
    expect(missingColumnHint({ code: "08006", message: "connection failure" }, "0003.sql")).toBeNull();
    expect(missingColumnHint(null, "0003.sql")).toBeNull();
  });
});
