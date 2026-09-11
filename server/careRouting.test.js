import { describe, expect, it } from "vitest";
import { canSeeEveryTier, routeConsultation, tierForRole } from "./careRouting.js";

const record = (over = {}) => ({ chief_complaints: [], associated_symptoms: [], medication_history: "", ...over });

describe("care routing", () => {
  it("routes an ordinary presentation to the community health worker queue", () => {
    expect(routeConsultation({ record: record({ chief_complaints: ["headache"], associated_symptoms: ["fever"] }) }))
      .toEqual({ tier: "chew", reasons: [] });
  });

  it("always sends a red flag to a doctor", () => {
    const routed = routeConsultation({
      record: record({ chief_complaints: ["chest pain"] }),
      redFlagStatus: { emergency: true, triggers: ["chest pain"] },
    });
    expect(routed.tier).toBe("doctor");
    expect(routed.reasons).toContain("emergency: chest pain");
  });

  it("sends doctor-only presentations to a doctor even with no red flag", () => {
    const routed = routeConsultation({ record: record({ chief_complaints: ["pregnancy"], associated_symptoms: ["back pain"] }) });
    expect(routed.tier).toBe("doctor");
    expect(routed.reasons).toContain("doctor-only presentation: pregnancy");
  });

  it("sends a patient on doctor-only therapy to a doctor", () => {
    const routed = routeConsultation({ record: record({ chief_complaints: ["cough"], medication_history: "Takes insulin every morning" }) });
    expect(routed.tier).toBe("doctor");
    expect(routed.reasons).toContain("doctor-only medication: insulin");
  });

  it("records every reason, so routing can be inspected rather than trusted", () => {
    const routed = routeConsultation({
      record: record({ chief_complaints: ["jaundice"], associated_symptoms: ["seizure"], medication_history: "warfarin" }),
      redFlagStatus: { emergency: true, triggers: ["seizure"] },
    });
    expect(routed.reasons.length).toBeGreaterThan(2);
  });

  it("is unaffected by casing and stray spacing in the record", () => {
    expect(routeConsultation({ record: record({ chief_complaints: ["  Pregnancy "] }) }).tier).toBe("doctor");
  });

  it("survives a malformed or empty record without routing downward", () => {
    expect(routeConsultation().tier).toBe("chew");
    expect(routeConsultation({ record: { chief_complaints: [null, 5], associated_symptoms: undefined } }).tier).toBe("chew");
  });
});

describe("who may work which queue", () => {
  it("puts community health cadres on the chew tier and clinicians above it", () => {
    expect(tierForRole("chew")).toBe("chew");
    expect(tierForRole("cho")).toBe("chew");
    expect(tierForRole("nurse")).toBe("chew");
    expect(tierForRole("doctor")).toBe("doctor");
    expect(tierForRole("admin")).toBe("doctor");
  });

  it("treats an unknown role as the most restricted caller, not the least", () => {
    // A typo or a future role must never silently gain the wider queue.
    for (const role of ["typo", "", null, undefined, "DOCTOR", "superuser"]) {
      expect(tierForRole(role)).toBe("chew");
      expect(canSeeEveryTier(role)).toBe(false);
    }
    expect(canSeeEveryTier("chew")).toBe(false);
    expect(canSeeEveryTier("doctor")).toBe(true);
  });
});
