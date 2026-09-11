import { afterEach, describe, expect, it, vi } from "vitest";
import { applyForAccess, getDoctorAccount, reviewApplication } from "./doctors.js";

vi.mock("./supabase/client", () => ({ doctorToken: async () => "session-token" }));
afterEach(() => vi.unstubAllGlobals());

describe("doctor account API", () => {
  it("carries the session token on every call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "pending", approved: false }) });
    vi.stubGlobal("fetch", fetchMock);

    await getDoctorAccount();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/doctors/me");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer session-token");
  });

  it("sends only the details the applicant is allowed to assert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ application: {} }) });
    vi.stubGlobal("fetch", fetchMock);

    await applyForAccess("Dr Adaeze Okonkwo", "MDCN/R/12345");

    // No email, status, or role: the server takes the email from the token and
    // fixes the rest, so an applicant cannot register itself as approved.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Dr Adaeze Okonkwo", licence_number: "MDCN/R/12345" });
  });

  it("surfaces the server's reason code so the app can show the right screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Your application is waiting for approval.", code: "pending" }),
    }));

    await expect(getDoctorAccount()).rejects.toMatchObject({ code: "pending" });
  });

  it("reviews an application by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ doctor: {} }) });
    vi.stubGlobal("fetch", fetchMock);

    await reviewApplication("doctor-7", "approved");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/doctors/doctor-7/status");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: "approved" });
  });
});
