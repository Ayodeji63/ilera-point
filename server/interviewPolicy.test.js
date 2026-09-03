import { describe, expect, it } from "vitest";
import { MAX_INTERVIEW_TURNS, shouldCompleteInterview } from "./interviewPolicy";

describe("interview completion policy", () => {
  it("completes naturally from turn two when nothing is missing", () => {
    expect(shouldCompleteInterview(1, [])).toBe(false);
    expect(shouldCompleteInterview(2, [])).toBe(true);
  });

  it("uses seven turns as a safety ceiling", () => {
    expect(shouldCompleteInterview(6, ["onset"])).toBe(false);
    expect(shouldCompleteInterview(MAX_INTERVIEW_TURNS, ["onset"])).toBe(true);
  });
});
