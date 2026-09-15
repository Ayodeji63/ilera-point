import { describe, expect, it } from "vitest";
import { drainChunks, languageCapacityCooldownMs, languageCapacityDelayMs, noteLanguageCapacityFailure, resetLanguageCapacityCooldowns, saharaSttUrl, validateStreamRequest } from "./saharaStt.js";

const SUPPORTED = new Set(["en", "yo", "pcm", "ha", "ig"]);

describe("Sahara streaming transcription", () => {
  it("describes the microphone format in the stream URL", () => {
    const url = new URL(saharaSttUrl({ languageCode: "yo", sampleRate: 48000 }));
    expect(url.protocol).toBe("wss:");
    expect(url.searchParams.get("use_language_asr_input")).toBe("yo");
    expect(url.searchParams.get("sample_rate")).toBe("48000");
    expect(url.searchParams.get("num_channels")).toBe("1");
  });

  it("rejects a language or sample rate Sahara cannot use", () => {
    expect(validateStreamRequest({ languageCode: "fr", sampleRate: 48000, supportedLanguages: SUPPORTED })).toMatch(/unsupported language/i);
    expect(validateStreamRequest({ languageCode: "en", sampleRate: 4000, supportedLanguages: SUPPORTED })).toMatch(/sample rate/i);
    expect(validateStreamRequest({ languageCode: "en", sampleRate: 48000, supportedLanguages: SUPPORTED })).toBeNull();
  });

  it("holds audio back until it reaches Sahara's minimum message size", () => {
    const { chunks, rest } = drainChunks(Buffer.alloc(8000));
    expect(chunks).toHaveLength(0);
    expect(rest).toHaveLength(8000);
  });

  it("never sends a message above Sahara's 32KB ceiling", () => {
    const { chunks, rest } = drainChunks(Buffer.alloc(70000));
    expect(chunks.map((chunk) => chunk.length)).toEqual([16384, 16384, 16384, 16384]);
    expect(rest).toHaveLength(4464);
  });

  it("pads a final sub-1KB tail to Sahara's minimum chunk size", () => {
    const { chunks, rest } = drainChunks(Buffer.alloc(900), { flush: true });
    expect(chunks.map((chunk) => chunk.length)).toEqual([1024]);
    expect(rest).toHaveLength(0);
  });

  it("flushes a valid final chunk without changing its audio length", () => {
    const { chunks, rest } = drainChunks(Buffer.alloc(4000), { flush: true });
    expect(chunks.map((chunk) => chunk.length)).toEqual([4000]);
    expect(rest).toHaveLength(0);
  });

  it("honours Sahara's requested per-language capacity cooldown", () => {
    resetLanguageCapacityCooldowns();
    expect(languageCapacityDelayMs("Required language not available for this session, please wait 30 seconds")).toBe(30000);
    noteLanguageCapacityFailure("en", "Required language not available for this session, please wait 30 seconds", 1000);
    expect(languageCapacityCooldownMs("en", 11000)).toBe(20000);
    expect(languageCapacityCooldownMs("yo", 11000)).toBe(0);
    resetLanguageCapacityCooldowns();
  });

  it("does not cooldown unrelated stream failures", () => {
    resetLanguageCapacityCooldowns();
    expect(noteLanguageCapacityFailure("en", "socket hang up", 1000)).toBe(0);
    expect(languageCapacityCooldownMs("en", 1001)).toBe(0);
  });
});
