import { afterEach, describe, expect, it, vi } from "vitest";
import { alertScript, splitForSpeech } from "./redFlagEscalation.js";
import { escalationNumber, placeCall, telephonyProvider, voiceBaseUrl, voiceXml } from "./telephony.js";
import { isAnsweredStatus, isUnansweredStatus, normalizeVoiceStatus } from "./voiceCalls.js";

afterEach(() => {
  for (const key of ["AT_USERNAME", "AT_API_KEY", "AT_PHONE_NUMBER", "AT_ENVIRONMENT", "ESCALATION_PHONE_NUMBER"]) delete process.env[key];
  vi.unstubAllGlobals();
});

describe("spoken alert", () => {
  it("names the trigger and tells the clinician what to do", () => {
    const script = alertScript(["chest pain"]);
    expect(script).toMatch(/chest pain/);
    expect(script).toMatch(/queue/i);
  });

  it("carries no patient identity, because a call can be overheard", () => {
    const script = alertScript(["seizure"]);
    expect(script).not.toMatch(/name|patient's|surname/i);
    expect(script.toLowerCase()).toContain("a patient");
  });

  it("still says something useful when the trigger list is empty", () => {
    expect(alertScript([])).toMatch(/urgent safety flag/i);
    expect(alertScript(undefined)).toMatch(/urgent safety flag/i);
  });

  it("splits into chunks Sahara accepts", () => {
    for (const chunk of splitForSpeech(alertScript(["difficulty breathing", "loss of consciousness"]))) {
      expect(chunk.length).toBeGreaterThanOrEqual(10);
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("pads a short line rather than sending one Sahara would reject", () => {
    expect(splitForSpeech("Help")[0]).toHaveLength(10);
  });
});

describe("escalation call", () => {
  it("stays inert when no provider is configured, rather than throwing", async () => {
    expect(telephonyProvider()).toBeNull();
    await expect(placeCall({ to: "+2348000000000", callId: "call-1" }))
      .resolves.toMatchObject({ placed: false, provider: null, sessionId: null });
  });

  it("does not attempt a call with no number to ring", async () => {
    process.env.AT_USERNAME = "sandbox";
    process.env.AT_API_KEY = "key";
    process.env.AT_PHONE_NUMBER = "+2341000000000";
    expect(escalationNumber()).toBe("");
    await expect(placeCall({ to: "", callId: "call-1" }))
      .resolves.toMatchObject({ placed: false, reason: expect.stringMatching(/ESCALATION_PHONE_NUMBER/) });
  });

  it("switches explicitly between the live and sandbox voice endpoints", () => {
    process.env.AT_ENVIRONMENT = "sandbox";
    expect(voiceBaseUrl()).toBe("https://voice.sandbox.africastalking.com");
    process.env.AT_ENVIRONMENT = "live";
    expect(voiceBaseUrl()).toBe("https://voice.africastalking.com");
    process.env.AT_ENVIRONMENT = "unknown";
    expect(() => voiceBaseUrl()).toThrow(/sandbox or live/);
  });

  it("builds escaped Africa's Talking Voice XML without accepting raw markup", () => {
    const xml = voiceXml([
      { type: "play", url: "https://example.com/a.wav?token=a&b=\"c\"" },
      { type: "play", url: "https://example.com/a.wav?token=a&b=\"c\"" },
    ]);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
    expect(xml.match(/<Play /g)).toHaveLength(2);
    expect(() => voiceXml([{ type: "<script>" }])).toThrow(/Unsupported/);
  });

  it("posts the durable call id to Africa's Talking and returns its session id", async () => {
    process.env.AT_USERNAME = "sandbox-user";
    process.env.AT_API_KEY = "secret-key";
    process.env.AT_PHONE_NUMBER = "+2341000000000";
    process.env.AT_ENVIRONMENT = "sandbox";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ entries: [{ status: "Queued", sessionId: "AT-session-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(placeCall({ to: "+2348000000000", callId: "call-123" }))
      .resolves.toEqual({ placed: true, provider: "africastalking", sessionId: "AT-session-1" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://voice.sandbox.africastalking.com/call");
    expect(options.headers.apiKey).toBe("secret-key");
    expect(Object.fromEntries(options.body)).toMatchObject({
      username: "sandbox-user",
      to: "+2348000000000",
      from: "+2341000000000",
      clientRequestId: "call-123",
    });
  });

  it("does not treat a provider-rejected entry as a placed call", async () => {
    process.env.AT_USERNAME = "sandbox-user";
    process.env.AT_API_KEY = "secret-key";
    process.env.AT_PHONE_NUMBER = "+2341000000000";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ entries: [{ status: "InvalidPhoneNumber", sessionId: "AT-session-1" }] }),
    }));

    await expect(placeCall({ to: "+2348000000000", callId: "call-123" }))
      .resolves.toMatchObject({ placed: false, sessionId: null, reason: "InvalidPhoneNumber" });
  });

  it("normalizes only clinician-reviewed call states before retry decisions", () => {
    expect(normalizeVoiceStatus("NoAnswer")).toBe("no_answer");
    expect(normalizeVoiceStatus("DROP TABLE voice_calls")).toBeNull();
    expect(isUnansweredStatus("no_answer")).toBe(true);
    expect(isUnansweredStatus("ringing")).toBe(false);
    expect(isAnsweredStatus("completed")).toBe(true);
  });
});
