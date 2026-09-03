import { afterEach, describe, expect, it, vi } from "vitest";
import { isPalmSearchMiss, normalizePalmImage, registerPalm } from "./tencentPalm.js";

afterEach(() => { vi.unstubAllGlobals(); delete process.env.TENCENT_PALM_API_KEY; });

describe("normalizePalmImage", () => {
  it("strips a browser data URL prefix", () => expect(normalizePalmImage("data:image/jpeg;base64,YWJj")).toBe("YWJj"));
  it("rejects malformed base64", () => expect(() => normalizePalmImage("not an image!" )).toThrow(/valid base64/i));
  it("rejects missing images", () => expect(() => normalizePalmImage("")).toThrow(/No palm image/i));
});

describe("isPalmSearchMiss", () => {
  it("treats Tencent's new-user response as a normal gallery miss", () => expect(isPalmSearchMiss("user not found in search")).toBe(true));
  it("does not hide service failures", () => expect(isPalmSearchMiss("authentication failed")).toBe(false));
});

describe("registerPalm", () => {
  it("matches PayByPalm's Tencent RGB registration body", async () => {
    process.env.TENCENT_PALM_API_KEY = "ak_test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, message: "ok", requestId: "req-1", data: { PalmId: "palm-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await registerPalm("patient-1", "YWJj");
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ UserId: "patient-1", RgbImage: { Data: "YWJj", ImageType: 1 }, IsForce: false });
    expect(options.headers.Authorization).toBe("Bearer ak_test");
  });

  it("preserves Tencent's quality code and request ID", async () => {
    process.env.TENCENT_PALM_API_KEY = "ak_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 1001005, message: "quality check failed", requestId: "quality-req" }),
    }));
    await expect(registerPalm("patient-1", "YWJj")).rejects.toMatchObject({
      message: "quality check failed",
      providerCode: 1001005,
      requestId: "quality-req",
    });
  });
});
