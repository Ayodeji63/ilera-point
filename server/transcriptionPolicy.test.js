import { describe, expect, it } from "vitest";
import { transcriptionPollDelay } from "./transcriptionPolicy.js";

describe("transcription polling policy", () => {
  it("checks quickly once, then backs off without exceeding 1.2 seconds", () => {
    expect(transcriptionPollDelay(0)).toBe(350);
    expect(transcriptionPollDelay(1)).toBe(600);
    expect(transcriptionPollDelay(3)).toBe(900);
    expect(transcriptionPollDelay(20)).toBe(1200);
  });
});
