import { describe, expect, it } from "vitest";
import { speechStreamUrl, toPcm16 } from "./pcmStream";

describe("live transcription audio", () => {
  it("converts microphone samples to the PCM16 Sahara expects", () => {
    expect(Array.from(toPcm16(new Float32Array([0, 1, -1, 0.5])))).toEqual([0, 32767, -32768, 16384]);
  });

  it("clamps samples that overshoot instead of wrapping them", () => {
    const pcm = toPcm16(new Float32Array([2, -2]));
    expect(Array.from(pcm)).toEqual([32767, -32768]);
  });

  it("follows the page protocol so a served kiosk uses wss", () => {
    expect(speechStreamUrl("yo", 48000, { protocol: "http:", host: "localhost:5173" }))
      .toBe("ws://localhost:5173/api/speech/stream?languageCode=yo&sampleRate=48000");
    expect(speechStreamUrl("en", 44100.7, { protocol: "https:", host: "kiosk.example" }))
      .toBe("wss://kiosk.example/api/speech/stream?languageCode=en&sampleRate=44101");
  });
});
