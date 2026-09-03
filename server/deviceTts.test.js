import { describe, expect, it } from "vitest";
import { synthesizeWithDeviceVoice } from "./deviceTts.js";

describe("kiosk device TTS fallback", () => {
  it("generates a valid WAV without a network provider", async () => {
    const audio = await synthesizeWithDeviceVoice("Please answer the question shown on screen.");
    expect(audio.subarray(0, 4).toString()).toBe("RIFF");
    expect(audio.length).toBeGreaterThan(44);
  }, 5000);
});
