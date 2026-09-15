import { afterEach, describe, expect, it } from "vitest";
import { languageDeployment } from "./languageSafety.js";

afterEach(() => { delete process.env.DISABLED_LANGUAGE_CODES; });

describe("language deployment gates", () => {
  it("keeps evaluated local-language modes supervised", () => {
    expect(languageDeployment("yo")).toMatchObject({ allowed: true, level: "supervised", requiresConfirmation: true });
  });

  it("supports an operational language kill switch", () => {
    process.env.DISABLED_LANGUAGE_CODES = "yo,ha";
    expect(languageDeployment("ha")).toMatchObject({ allowed: false, level: "disabled" });
    expect(languageDeployment("ig").allowed).toBe(true);
  });
});

