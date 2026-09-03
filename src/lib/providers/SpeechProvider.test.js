import { afterEach, describe, expect, it, vi } from "vitest";
import { SaharaSpeechProvider } from "./SpeechProvider";

afterEach(() => vi.unstubAllGlobals());

describe("SaharaSpeechProvider", () => {
  it("passes cancellation through to transcription", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ transcript: "fever" }) });
    vi.stubGlobal("fetch", fetchMock);
    await new SaharaSpeechProvider().transcribe(new Blob(["audio"], { type: "audio/webm" }), "en", "standard", controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("passes cancellation through to the synthesize request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["wav"]) });
    vi.stubGlobal("fetch", fetchMock);

    await new SaharaSpeechProvider().synthesize("What is bringing you here today?", "yoruba", "female", "en", controller.signal);

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("reuses prefetched speech without a second request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["prefetched-wav"]) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new SaharaSpeechProvider();
    const text = `Prefetched question ${Date.now()}`;

    await provider.preload(text, "yoruba", "female", "en");
    await provider.synthesize(text, "yoruba", "female", "en");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
