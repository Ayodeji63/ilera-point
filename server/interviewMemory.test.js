import { describe, expect, it } from "vitest";
import { buildInterviewMemory } from "./interviewMemory";

describe("interview session memory", () => {
  it("keeps the complete ordered conversation and accumulated clinical record", () => {
    const turns = [
      { turn_number: 1, question_asked: "What is the main health problem?", transcript: "Fever and headache" },
      { turn_number: 2, question_asked: "When did this problem start?", transcript: "Two days ago" },
      { turn_number: 3, question_asked: "What other symptoms have you noticed?", transcript: "None" },
    ];
    const record = {
      chief_complaints: ["fever", "headache"], onset: "two days ago",
      associated_symptoms: [], negative_symptoms_checked: [], medication_history: "",
      still_missing: ["associated symptoms", "medication history"],
    };

    const memory = buildInterviewMemory(turns, record);

    expect(memory.topic_history.map(({ turn_number, topic }) => [turn_number, topic])).toEqual([
      [1, "chief"], [2, "onset"], [3, "symptoms"],
    ]);
    expect(memory.answered_topics).toEqual(["chief", "onset", "symptoms"]);
    expect(memory.explicitly_denied_topics).toEqual(["symptoms"]);
    expect(memory.unresolved_items).toEqual(["medication history"]);
    expect(memory.clinical_record.chief_complaints).toEqual(["fever", "headache"]);
  });

  it("does not mark a topic answered when the patient asks for clarification", () => {
    const turns = [{ turn_number: 1, question_asked: "When did it start?", transcript: "I don't understand, say again" }];
    const memory = buildInterviewMemory(turns, { associated_symptoms: [], still_missing: ["onset"] });
    expect(memory.answered_topics).toEqual([]);
    expect(memory.topic_history[0].understood).toBe(false);
  });
});
