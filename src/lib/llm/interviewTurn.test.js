import { afterEach, describe, expect, it, vi } from "vitest";
import { interviewTurn } from "./interviewTurn";

afterEach(() => vi.unstubAllGlobals());

describe("interviewTurn", () => {
  it("passes its deadline signal to the interview request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ next_question: "When did it start?" }) });
    vi.stubGlobal("fetch", fetchMock);
    await interviewTurn([], {}, "en", controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
