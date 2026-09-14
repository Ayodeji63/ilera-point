import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePulseVitals, captureTemperatureVitals, captureVitals, vitalsUrl } from "./vitals";

const reply = (body, ok = true) => ({ ok, json: async () => body });

describe("vitals capture client", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("polls the local bridge until a complete reading arrives", async () => {
    const result = { temperature_c: 36.7, heart_rate_bpm: 74, captured_at: "2026-09-14T00:00:00Z", confidence: 0.9, sample_quality: "good" };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "capture-1" }))
      .mockResolvedValueOnce(reply({ status: "capturing", progress: 0.5, waveform: [0.2, 0.8] }))
      .mockResolvedValueOnce(reply({ status: "complete", result }));
    const updates = [];

    await expect(captureVitals({ fetchImpl, pollMs: 0, onUpdate: (state) => updates.push(state) })).resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8787/api/vitals/session/capture-1",
      { signal: undefined, targetAddressSpace: "loopback" },
    );
    expect(updates).toHaveLength(2);
  });

  it("allows a different Raspberry Pi loopback endpoint to be configured", async () => {
    vi.stubEnv("VITE_VITALS_API_ORIGIN", "http://127.0.0.1:8877/");
    expect(vitalsUrl("/api/vitals/health")).toBe("http://127.0.0.1:8877/api/vitals/health");

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "capture-3" }))
      .mockResolvedValueOnce(reply({ status: "complete", result: { temperature_c: 36.6 } }));
    await captureVitals({ fetchImpl, pollMs: 0 });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8877/api/vitals/session/capture-3",
      { signal: undefined, targetAddressSpace: "loopback" },
    );
  });

  it("surfaces a sensor quality failure so the patient can retry or skip", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "capture-2" }))
      .mockResolvedValueOnce(reply({ status: "error", error: "Keep your finger still and try again." }));

    await expect(captureVitals({ fetchImpl, pollMs: 0 })).rejects.toThrow("Keep your finger still");
  });

  it("returns a partial result when one sensor produced a trustworthy reading", async () => {
    const result = { temperature_c: 36.5, heart_rate_bpm: null, sample_quality: "none" };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "capture-4" }))
      .mockResolvedValueOnce(reply({ status: "partial", warnings: ["Pulse unavailable."], result }));

    await expect(captureVitals({ fetchImpl, pollMs: 0 })).resolves.toEqual(result);
  });

  it("starts pulse and temperature as separate, patient-triggered sessions", async () => {
    const pulseFetch = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "pulse-1" }))
      .mockResolvedValueOnce(reply({ status: "complete", result: { heart_rate_bpm: 71 } }));
    const temperatureFetch = vi.fn()
      .mockResolvedValueOnce(reply({ session_id: "temperature-1" }))
      .mockResolvedValueOnce(reply({ status: "complete", result: { temperature_surface_c: 32.4 } }));

    await capturePulseVitals({ fetchImpl: pulseFetch, pollMs: 0 });
    await captureTemperatureVitals({ fetchImpl: temperatureFetch, pollMs: 0 });

    expect(pulseFetch.mock.calls[0][0]).toBe("http://127.0.0.1:8787/api/vitals/pulse/session");
    expect(temperatureFetch.mock.calls[0][0]).toBe("http://127.0.0.1:8787/api/vitals/temperature/session");
  });
});
