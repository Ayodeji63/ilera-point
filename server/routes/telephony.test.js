import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  findVoiceCall: vi.fn(),
  scheduleVoiceCallRetry: vi.fn(),
  updateVoiceCall: vi.fn(),
  updateVoiceCallIfUnanswered: vi.fn(),
}));

vi.mock("../supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) } }),
}));

vi.mock("../voiceCalls.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    findVoiceCall: mocks.findVoiceCall,
    scheduleVoiceCallRetry: mocks.scheduleVoiceCallRetry,
    updateVoiceCall: mocks.updateVoiceCall,
    updateVoiceCallIfUnanswered: mocks.updateVoiceCallIfUnanswered,
  };
});

import { telephonyRouter } from "./telephony.js";

let server;
let origin;

beforeAll(async () => {
  const app = express();
  app.use("/api/telephony", telephonyRouter);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => vi.clearAllMocks());

describe("Africa's Talking callbacks", () => {
  it("rejects an unknown call with bare Voice XML and no reflected input", async () => {
    mocks.findVoiceCall.mockResolvedValue(null);
    const response = await fetch(`${origin}/api/telephony/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ clientRequestId: "123e4567-e89b-42d3-a456-426614174000", hostile: "<script>" }),
    });
    expect(await response.text()).toBe("<Response><Reject/></Response>");
  });

  it("signs private alert audio at answer time and plays an escalation twice", async () => {
    mocks.findVoiceCall.mockResolvedValue({
      id: "123e4567-e89b-42d3-a456-426614174000",
      kind: "escalation",
      audio_path: "case/audio.wav",
      answered_at: null,
    });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.test/audio?a=1&b=2" }, error: null });
    const response = await fetch(`${origin}/api/telephony/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ clientRequestId: "123e4567-e89b-42d3-a456-426614174000" }),
    });
    const xml = await response.text();
    expect(xml.match(/<Play /g)).toHaveLength(2);
    expect(xml).toContain("&amp;");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("case/audio.wav", 1800);
    expect(mocks.updateVoiceCall).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "answered" }));
  });

  it("can resolve the answer callback by the provider session id", async () => {
    mocks.findVoiceCall.mockResolvedValue({
      id: "123e4567-e89b-42d3-a456-426614174000",
      kind: "followup",
      session_id: "AT-session-1",
      audio_path: "case/followup.wav",
      answered_at: null,
    });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.test/followup.wav" }, error: null });
    const response = await fetch(`${origin}/api/telephony/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ sessionId: "AT-session-1" }),
    });
    expect((await response.text()).match(/<Play /g)).toHaveLength(1);
    expect(mocks.findVoiceCall).toHaveBeenCalledWith({ callId: null, sessionId: "AT-session-1" });
  });

  it("does not parse oversized application JSON on the public callback", async () => {
    const response = await fetch(`${origin}/api/telephony/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientRequestId: "123e4567-e89b-42d3-a456-426614174000" }),
    });
    expect(await response.text()).toBe("<Response><Reject/></Response>");
    expect(mocks.findVoiceCall).not.toHaveBeenCalled();
  });

  it("schedules a retry only for a known unanswered escalation", async () => {
    const call = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      kind: "escalation",
      session_id: "AT-session-1",
      answered_at: null,
      attempts: 1,
    };
    mocks.findVoiceCall.mockResolvedValue(call);
    mocks.updateVoiceCallIfUnanswered.mockResolvedValue({ ...call, status: "no_answer" });
    const response = await fetch(`${origin}/api/telephony/events`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ sessionId: "AT-session-1", status: "NoAnswer" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.updateVoiceCallIfUnanswered).toHaveBeenCalledWith(call.id, { status: "no_answer" });
    expect(mocks.scheduleVoiceCallRetry).toHaveBeenCalledWith(expect.objectContaining({ id: call.id, status: "no_answer" }));
  });
});
