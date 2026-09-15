import { afterEach, describe, expect, it, vi } from "vitest";
import { saveConsultation, withdrawOptionalConsent } from "./consultations.js";

afterEach(() => vi.unstubAllGlobals());

describe("consultation upload", () => {
  it("normalizes browser recording blobs to the bucket's video/webm type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ consultation: { id: "case-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await saveConsultation({ patient_id: "patient-1", turns: [], structured_record: {} }, new Blob(["video"], { type: "text/plain" }));

    const form = fetchMock.mock.calls[0][1].body;
    expect(form.get("video").type).toBe("video/webm");
    expect(form.get("video").name).toMatch(/\.webm$/);
  });
});

describe("optional consent withdrawal", () => {
  it("uses the active patient capability without placing it in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ withdrawn: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await withdrawOptionalConsent("case-1", "private-token");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/consultations/case-1/consent/withdraw");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ token: "private-token" }) });
  });
});
