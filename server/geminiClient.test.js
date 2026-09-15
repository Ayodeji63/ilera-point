import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiApiKeys, geminiGenerateContent, resetGeminiKeyPoolForTests } from "./geminiClient.js";

afterEach(() => resetGeminiKeyPoolForTests());

describe("Gemini key failover", () => {
  it("combines and deduplicates the legacy key and pooled keys", () => {
    expect(geminiApiKeys({ GEMINI_API_KEY: "first", GEMINI_API_KEYS: "second, first\nthird" }))
      .toEqual(["first", "second", "third"]);
  });

  it("switches keys after quota exhaustion", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 429, ok: false, headers: { get: () => null } })
      .mockResolvedValueOnce({ status: 200, ok: true });
    const response = await geminiGenerateContent({ model: "model", body: {}, apiKeys: ["key-one", "key-two"], fetchImpl });
    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toContain("key-one");
    expect(fetchImpl.mock.calls[1][0]).toContain("key-two");
  });

  it("keeps a quota-exhausted key out of the next request", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 429, ok: false, headers: { get: () => null } })
      .mockResolvedValue({ status: 200, ok: true });
    const request = { model: "model", body: {}, apiKeys: ["key-one", "key-two"], fetchImpl };
    await geminiGenerateContent(request);
    await geminiGenerateContent(request);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][0]).toContain("key-two");
  });

  it("does not rotate on a malformed request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 400, ok: false });
    await geminiGenerateContent({ model: "model", body: {}, apiKeys: ["key-one", "key-two"], fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("switches keys after a network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("socket closed")).mockResolvedValueOnce({ status: 200, ok: true });
    await expect(geminiGenerateContent({ model: "model", body: {}, apiKeys: ["key-one", "key-two"], fetchImpl })).resolves.toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
