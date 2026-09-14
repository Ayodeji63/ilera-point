import { describe, expect, it, vi } from "vitest";
import { captureVitals } from "./vitals";

const reply = (body, ok = true) => ({ ok, json: async () => body });

describe("vitals capture client", () => {
  it("polls the local bridge until a complete reading arrives", async () => {
    const result = { temperature_c: 36.7, heart_rate_bpm: 74, captured_at: "2026-09-14T00:00:00Z", confidence: 0.9, sample_quality: "good" };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "capture-1" }))
      .mockResolvedValueOnce(reply({ status: "capturing", progress: 0.5, waveform: [0.2, 0.8] }))
      .mockResolvedValueOnce(reply({ status: "complete", result }));
    const updates = [];

    await expect(captureVitals({ fetchImpl, pollMs: 0, onUpdate: (state) => updates.push(state) })).resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenLastCalledWith("/api/vitals/session/capture-1", { signal: undefined });
    expect(updates).toHaveLength(2);
  });

  it("surfaces a sensor quality failure so the patient can retry or skip", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "capture-2" }))
      .mockResolvedValueOnce(reply({ status: "error", error: "Keep your finger still and try again." }));

    await expect(captureVitals({ fetchImpl, pollMs: 0 })).rejects.toThrow("Keep your finger still");
  });
});
