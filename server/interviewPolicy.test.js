import { describe, expect, it } from "vitest";
import { MAX_INTERVIEW_TURNS, isExplicitDenial, questionTopic, questionsAreSimilar, reconcileStillMissing, selectNextQuestion, shouldCompleteInterview } from "./interviewPolicy";

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

  it("treats a clear Yoruba denial as a completed associated-symptoms topic", () => {
    const turns = [{ question_asked: "Àwọn àmì àìsàn mìíràn wo ni o ti rí?", transcript: "Kò sí àìsàn mìíràn rárá." }];
    const record = { associated_symptoms: [], still_missing: ["associated symptoms", "medication history"] };

    expect(questionTopic(turns[0].question_asked)).toBe("symptoms");
    expect(isExplicitDenial(turns[0].transcript)).toBe(true);
    expect(reconcileStillMissing(record, turns)).toEqual(["medication history"]);
  });

  it("rejects a new symptoms question when medication is the next missing topic", () => {
    expect(selectNextQuestion("Is there any other symptom?", [], ["medication history"], "en"))
      .toMatch(/medicine/i);
  });

  it("does not re-open medication history already confirmed before the interview", () => {
    expect(reconcileStillMissing({ associated_symptoms: [], medication_history: "None reported", still_missing: ["medication history", "onset"] }, []))
      .toEqual(["onset"]);
  });

  it("uses a topic-safe fallback when a generated question cannot be classified", () => {
    expect(selectNextQuestion("Can you tell me a little more?", [], ["associated symptoms"], "en"))
      .toMatch(/other symptoms|what else/i);
  });
});
