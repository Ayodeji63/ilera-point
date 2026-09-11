import { describe, expect, it } from "vitest";
import { audioRms, calibratedNoiseFloor, voiceThreshold } from "./sessionRecorder.js";

describe("automatic speech detection", () => {
  it("measures silence and audio energy", () => {
    expect(audioRms(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(audioRms(new Uint8Array([128, 160, 96]))).toBeGreaterThan(0.1);
  });

  it("keeps the adaptive voice threshold usable in quiet and noisy rooms", () => {
    expect(voiceThreshold(0.001)).toBe(0.012);
    expect(voiceThreshold(0.02)).toBeCloseTo(0.056);
    expect(voiceThreshold(0.2)).toBe(0.12);
  });

  it("uses the quiet part of calibration so an eager first word does not raise the threshold", () => {
    expect(calibratedNoiseFloor([0.01, 0.011, 0.012, 0.09, 0.1])).toBe(0.011);
    expect(calibratedNoiseFloor([])).toBe(0);
  });
});
