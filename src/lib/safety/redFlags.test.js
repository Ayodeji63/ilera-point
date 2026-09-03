import { describe, expect, it } from "vitest";
import { checkRedFlags } from "./redFlags";

describe("checkRedFlags", () => {
  it("flags exact emergency symptoms from either symptom list", () => {
    expect(checkRedFlags({ chief_complaints: ["chest pain"], associated_symptoms: ["fever"] })).toEqual({ emergency: true, triggers: ["chest pain"] });
    expect(checkRedFlags({ chief_complaints: [], associated_symptoms: ["seizure"] }).emergency).toBe(true);
  });

  it("does not treat checked negative symptoms as emergencies", () => {
    expect(checkRedFlags({ chief_complaints: ["headache"], associated_symptoms: [] })).toEqual({ emergency: false, triggers: [] });
  });
});
