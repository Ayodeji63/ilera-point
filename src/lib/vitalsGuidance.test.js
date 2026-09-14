import { describe, expect, it } from "vitest";
import { hasLocalizedVitalsGuidance, vitalsGuidance } from "./vitalsGuidance";

describe("sensor guidance localization", () => {
  it("provides localized Start controls and voice scripts for Yoruba-English", () => {
    expect(vitalsGuidance("yo", "pulse").start).toBe("Bẹ̀rẹ̀ ìwọ̀n");
    expect(vitalsGuidance("yo", "temperature").voice).toContain("centimita méjì sí mẹ́ta");
    expect(hasLocalizedVitalsGuidance("yo")).toBe(true);
  });

  it("provides localized Start controls and voice scripts for Igbo-English", () => {
    expect(vitalsGuidance("ig", "pulse").start).toBe("Bido nyocha");
    expect(vitalsGuidance("ig", "temperature").voice).toContain("sentimita abụọ ruo atọ");
    expect(hasLocalizedVitalsGuidance("ig")).toBe(true);
  });

  it("falls back to English for the other language pairs", () => {
    expect(vitalsGuidance("ha", "pulse").start).toBe("Start pulse check");
    expect(hasLocalizedVitalsGuidance("ha")).toBe(false);
  });
});
