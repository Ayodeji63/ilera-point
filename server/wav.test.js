import { describe, expect, it } from "vitest";
import { mergeWavBuffers } from "./wav";

function makeWav(sampleRate, pcmSize) {
  const pcm = Buffer.alloc(pcmSize);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

describe("mergeWavBuffers", () => {
  it("preserves Sahara's actual sample rate when merging chunks", () => {
    const merged = mergeWavBuffers([makeWav(22050, 100), makeWav(22050, 120)]);
    expect(merged.readUInt32LE(24)).toBe(22050);
    expect(merged.readUInt32LE(40)).toBe(220);
    expect(merged.length).toBe(264);
  });

  it("inserts requested silence between speech chunks", () => {
    const merged = mergeWavBuffers([makeWav(22050, 100), makeWav(22050, 120)], [500, 0]);
    expect(merged.readUInt32LE(40)).toBe(100 + 22050 + 120);
  });

  it("rejects incompatible chunk formats", () => {
    expect(() => mergeWavBuffers([makeWav(22050, 10), makeWav(48000, 10)])).toThrow(/incompatible/);
  });
});
