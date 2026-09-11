import { describe, expect, it } from "vitest";
import { describeSessionFailure, normalizeSaharaAudioUrl, saharaPoolKey, saharaSocketOptions, saharaSocketUrl, submitTextChunks } from "./saharaTts.js";
import { hasStreamSlot, resetStreamBudget } from "./saharaStreamBudget.js";

describe("Sahara streaming TTS configuration", () => {
  it("connects without negotiating compression", () => {
    expect(saharaSocketOptions("test-key")).toMatchObject({
      headers: { Authorization: "Bearer test-key" },
      perMessageDeflate: false,
      handshakeTimeout: 10000,
    });
  });

  it("includes the requested voice in the streaming URL", () => {
    const url = new URL(saharaSocketUrl({ voiceAccent: "yoruba", voiceGender: "female", language: "en" }));
    expect(url.protocol).toBe("wss:");
    expect(url.searchParams.get("voice_accent")).toBe("yoruba");
    expect(url.searchParams.get("voice_gender")).toBe("female");
    expect(url.searchParams.get("voice_language")).toBe("en");
    expect(url.searchParams.get("output_audio_format")).toBe("wav");
  });

  it("keeps warm sessions isolated by accent, gender, and language", () => {
    expect(saharaPoolKey({ voiceAccent: "yoruba", voiceGender: "female", language: "en" }))
      .not.toBe(saharaPoolKey({ voiceAccent: "yoruba", voiceGender: "female", language: "yo" }));
  });

  it("submits every text chunk before waiting for acknowledgements", async () => {
    const sent = [];
    const acknowledgements = [];
    const ws = { send: (message) => sent.push(JSON.parse(message)) };
    const nextMessage = () => new Promise((resolve) => acknowledgements.push(resolve));

    const submission = submitTextChunks(ws, nextMessage, ["first chunk", "second chunk"]);
    expect(sent).toHaveLength(2);
    acknowledgements.forEach((resolve, index) => resolve({ message_type: "TEXT_CHUNK_ACK", ack_id: index + 1 }));
    await submission;
    expect(sent.map(({ ack_id }) => ack_id)).toEqual([1, 2]);
  });

  it("reports a malformed frame as the stream rate limit and stops opening sockets", () => {
    resetStreamBudget();
    const failure = describeSessionFailure(new Error("Invalid WebSocket frame: RSV1 must be clear"));
    expect(failure.message).toMatch(/stream connection limit reached/i);
    expect(hasStreamSlot()).toBe(false);
    resetStreamBudget();
  });

  it("passes other session failures through untouched", () => {
    const failure = new Error("socket hang up");
    expect(describeSessionFailure(failure)).toBe(failure);
  });

  it("upgrades Sahara's trusted S3 audio URL to HTTPS", () => {
    expect(normalizeSaharaAudioUrl("http://intron-transcribe.s3.amazonaws.com/audio.wav").href)
      .toBe("https://intron-transcribe.s3.amazonaws.com/audio.wav");
    expect(() => normalizeSaharaAudioUrl("https://example.com/audio.wav")).toThrow(/invalid audio URL/i);
  });
});
