import { afterEach, describe, expect, it } from "vitest";
import { alertScript, splitForSpeech } from "./redFlagEscalation.js";
import { escalationNumber, placeCall, playTwiml, telephonyProvider } from "./telephony.js";

afterEach(() => {
  for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "ESCALATION_PHONE_NUMBER"]) delete process.env[key];
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
    await expect(placeCall({ to: "+2348000000000", audioUrl: "https://example.com/a.wav" }))
      .resolves.toMatchObject({ placed: false });
  });

  it("does not attempt a call with no number to ring", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC1";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    expect(escalationNumber()).toBe("");
    await expect(placeCall({ to: "", audioUrl: "https://example.com/a.wav" }))
      .resolves.toMatchObject({ placed: false, reason: expect.stringMatching(/ESCALATION_PHONE_NUMBER/) });
  });

  it("plays the alert twice and escapes the signed URL into valid TwiML", () => {
    const twiml = playTwiml("https://example.com/a.wav?token=a&b=c");
    expect(twiml).toContain("&amp;");
    expect(twiml).not.toMatch(/[^&]&[^a]/);
    // Repeated once, because a clinician answering a call rarely catches the
    // first second of it.
    expect(twiml.match(/<Play>/g)).toHaveLength(2);
  });
});
