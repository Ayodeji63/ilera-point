import { describe, expect, it } from "vitest";
import { saharaSocketOptions, saharaSocketUrl } from "./saharaTts.js";

describe("Sahara streaming TTS configuration", () => {
  it("disables WebSocket compression to prevent invalid fragmented frames", () => {
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
});
