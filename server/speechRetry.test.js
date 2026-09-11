import { describe, expect, it } from "vitest";
import { isSaharaStreamLimited, isTransientSaharaFailure, shouldRetrySahara } from "./speechRetry.js";

describe("Sahara retry policy", () => {
  it("reads a malformed provider frame as the stream rate limit", () => {
    // Sahara writes a raw HTTP 429 onto the upgraded socket; `ws` reports the
    // response's first byte as a frame with RSV1 set.
    expect(isSaharaStreamLimited("Invalid WebSocket frame: RSV1 must be clear")).toBe(true);
    expect(isSaharaStreamLimited("Sahara stream connection limit reached (3 per minute).")).toBe(true);
    expect(isSaharaStreamLimited("socket hang up")).toBe(false);
  });

  it("does not reconnect into a rate limit, but still falls back to HTTP", () => {
    expect(shouldRetrySahara("Invalid WebSocket frame: RSV1 must be clear", 1)).toBe(false);
    expect(isTransientSaharaFailure("Invalid WebSocket frame: RSV1 must be clear")).toBe(true);
    expect(isTransientSaharaFailure("Sahara stream connection limit reached (3 per minute).")).toBe(true);
  });

  it("treats a queued generate response as something to wait out, not a failure", () => {
    // Sahara answers the generate endpoint with this while it is still
    // rendering; failing the request here would silence the kiosk.
    expect(isTransientSaharaFailure("tts text queued for processing")).toBe(true);
    expect(shouldRetrySahara("tts text queued for processing", 1)).toBe(true);
  });

  it("reconnects after a dropped socket", () => {
    expect(shouldRetrySahara("socket hang up", 1)).toBe(true);
    expect(shouldRetrySahara("Sahara speech session timed out.", 1)).toBe(true);
    expect(isTransientSaharaFailure("Sahara speech generation failed.")).toBe(true);
  });

  it("does not retry invalid configuration or a final attempt", () => {
    expect(shouldRetrySahara("Invalid voice language", 1)).toBe(false);
    expect(shouldRetrySahara("socket hang up", 2)).toBe(false);
  });
});
