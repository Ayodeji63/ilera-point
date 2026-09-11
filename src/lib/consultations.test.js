import { afterEach, describe, expect, it, vi } from "vitest";
import { saveConsultation } from "./consultations.js";

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
