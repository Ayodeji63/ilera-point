import { describe, expect, it } from "vitest";
import { MAX_INTERVIEW_TURNS, questionsAreSimilar, selectNextQuestion, shouldCompleteInterview } from "./interviewPolicy";

describe("interview completion policy", () => {
  it("completes naturally from turn two when nothing is missing", () => {
    expect(shouldCompleteInterview(1, [])).toBe(false);
    expect(shouldCompleteInterview(2, [])).toBe(true);
  });

  it("continues beyond seven while details are missing and keeps a runaway ceiling", () => {
    expect(shouldCompleteInterview(7, ["onset"])).toBe(false);
    expect(shouldCompleteInterview(MAX_INTERVIEW_TURNS, ["onset"])).toBe(true);
  });

  it("detects repeated wording despite punctuation and Yoruba tone marks", () => {
    expect(questionsAreSimilar("Oògùn wo ni o ti lò?", "Oogun wo ni o ti lo.")).toBe(true);
  });

  it("replaces repeated or overly long medication questions with a concise rephrase", () => {
    const turns = [{ question_asked: "Oògùn wo ni o ti lò fún ìṣòro yìí?" }];
    expect(selectNextQuestion("Oògùn wo ni o ti lò fún ìṣòro yìí?", turns, ["medication history"], "yo"))
      .toMatch(/orúkọ oògùn/);
    expect(selectNextQuestion("A".repeat(151), [], ["medication history"], "en")).toMatch(/medicines/i);
  });

  it("follows the first missing clinical topic instead of jumping to medication", () => {
    expect(selectNextQuestion("", [], ["onset", "medication history"], "en")).toMatch(/when|how long/i);
  });

  it("keeps fallback questions in the patient's supported language", () => {
    expect(selectNextQuestion("", [], ["onset"], "pcm")).toMatch(/start|how long/i);
    expect(selectNextQuestion("", [], ["onset"], "ha")).toMatch(/Yaushe|Har yaushe/);
    expect(selectNextQuestion("", [], ["onset"], "ig")).toMatch(/Kedu mgbe|Ogologo oge/);
  });
});
