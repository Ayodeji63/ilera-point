import { describe, expect, it, vi } from "vitest";
import { transcribeTurn } from "./transcribeTurn";

const blob = new Blob(["audio"], { type: "audio/webm" });

describe("turn transcription", () => {
  it("uses the live transcript without uploading the recording", async () => {
    const upload = vi.fn();
    const transcriber = { commit: async () => "I have fever and headache." };

    await expect(transcribeTurn({ transcriber, blob, language: "en", upload })).resolves.toBe("I have fever and headache.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads the recording when the live socket fails", async () => {
    const upload = vi.fn().mockResolvedValue({ transcript: "from the upload" });
    const transcriber = { commit: async () => { throw new Error("connection closed"); } };
    const fallbacks = [];

    await expect(transcribeTurn({ transcriber, blob, language: "yo", upload, onFallback: (m) => fallbacks.push(m) }))
      .resolves.toBe("from the upload");
    expect(upload).toHaveBeenCalledWith(blob, "yo", "standard", undefined);
    expect(fallbacks).toEqual(["connection closed"]);
  });

  it("uploads the recording when live transcription heard nothing", async () => {
    const upload = vi.fn().mockResolvedValue({ transcript: "recovered words" });
    await expect(transcribeTurn({ transcriber: { commit: async () => "   " }, blob, language: "en", upload }))
      .resolves.toBe("recovered words");
  });

  it("uploads directly when live transcription never started", async () => {
    const upload = vi.fn().mockResolvedValue({ transcript: "uploaded" });
    await expect(transcribeTurn({ transcriber: null, blob, language: "en", upload })).resolves.toBe("uploaded");
  });

  it("does not retry a turn the patient cancelled", async () => {
    const upload = vi.fn();
    const signal = { aborted: true };
    const transcriber = { commit: async () => { throw new Error("aborted"); } };

    await expect(transcribeTurn({ transcriber, blob, language: "en", signal, upload })).rejects.toThrow("aborted");
    expect(upload).not.toHaveBeenCalled();
  });

  it("closes a pending live stream when the turn deadline aborts", async () => {
    const controller = new AbortController();
    const transcriber = { commit: () => new Promise(() => {}), close: vi.fn() };
    const upload = vi.fn();
    const pending = transcribeTurn({ transcriber, blob, language: "en", signal: controller.signal, upload });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(transcriber.close).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
  });
});
