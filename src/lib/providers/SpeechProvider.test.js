import { afterEach, describe, expect, it, vi } from "vitest";
import { SaharaSpeechProvider } from "./SpeechProvider";

afterEach(() => vi.unstubAllGlobals());

function ndjsonResponse(lines) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        // One network read per line, so the reader has to reassemble the stream.
        for (const line of lines) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        controller.close();
      },
    }),
  };
}

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
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ requireSahara: true, mode: "kiosk", language: "en", voiceAccent: "yoruba" });
  });

  it("plays progressive chunks in reading order even when they finish out of order", async () => {
    const lines = [
      { index: 1, pauseMs: 0, audioBase64: btoa("second") },
      { index: 0, pauseMs: 240, audioBase64: btoa("first") },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse(lines)));

    const parts = [];
    for await (const part of new SaharaSpeechProvider().stream(`Ordered ${Date.now()}`, "yoruba", "female", "yo")) {
      parts.push({ pauseMs: part.pauseMs, text: await part.blob.text() });
    }

    expect(parts).toEqual([{ pauseMs: 240, text: "first" }, { pauseMs: 0, text: "second" }]);
  });

  it("asks for progressive delivery and falls back to one merged clip", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "streaming unavailable" }) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["merged-wav"]) });
    vi.stubGlobal("fetch", fetchMock);

    const parts = [];
    for await (const part of new SaharaSpeechProvider().stream(`Fallback ${Date.now()}`, "yoruba", "female", "en")) parts.push(part);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).progressive).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).progressive).toBeUndefined();
    expect(await parts[0].blob.text()).toBe("merged-wav");
  });

  it("surfaces a mid-stream failure instead of falling back over played audio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse([
      { index: 0, pauseMs: 0, audioBase64: btoa("spoken") },
      { error: "Sahara speech generation failed." },
    ])));

    const stream = new SaharaSpeechProvider().stream(`Interrupted ${Date.now()}`, "yoruba", "female", "en");
    await stream.next();
    await expect(stream.next()).rejects.toThrow(/speech generation failed/i);
  });

  it("reuses prefetched speech without a second request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["prefetched-wav"]) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new SaharaSpeechProvider();
    const text = `Prefetched question ${Date.now()}`;

    await provider.preload(text, "yoruba", "female", "en");
    await provider.synthesize(text, "yoruba", "female", "en");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ preload: true, mode: "kiosk" });
  });
});
