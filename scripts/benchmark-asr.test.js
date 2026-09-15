import { describe, expect, it } from "vitest";
import { abbreviationAccuracy, phraseAccuracy, phraseWordErrorRate, validateBenchmarkManifest, wordErrorRate } from "./benchmark-asr.js";

describe("clinical ASR benchmark metrics", () => {
  it("computes word error rate", () => expect(wordErrorRate("give 500 mg", "give 250 mg")).toBeCloseTo(1 / 3));
  it("matches joined and separated dose units", () => expect(phraseAccuracy("500 mg", "Paracetamol 500mg TDS")).toBe(1));
  it("computes entity WER against the closest phrase", () => {
    expect(phraseWordErrorRate("amoxicillin", "give amoxycillin 500 mg")).toBe(1);
    expect(phraseWordErrorRate("500 mg", "give paracetamol 500mg TDS")).toBe(0);
  });
  it("scores clinical abbreviations independently", () => expect(abbreviationAccuracy(["TDS", "PRN"], "Paracetamol TDS and review PRN")).toBe(1));
  it("rejects duplicate or incomplete manifest rows before paid calls", () => {
    expect(() => validateBenchmarkManifest([
      { id: "same", audio: "a.webm", language: "yo", reference: "text", drug: "drug", dose: "5 mg", abbreviations: [] },
      { id: "same", audio: "b.webm", language: "xx", reference: "", drug: "drug", dose: "", abbreviations: [] },
    ], "/tmp", { checkFiles: false })).toThrow(/duplicated/);
  });
});
