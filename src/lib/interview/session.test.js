import { describe, expect, it } from "vitest";
import { commitInterviewTurn, createInterviewSession, createTurn, rollbackLastTurn, updateSessionRecord } from "./session";

describe("interview session", () => {
  it("stores full turn history and restores the exact pre-turn record", () => {
    const initial = createInterviewSession("What brings you in today?");
    const turn = createTurn(initial, "I have fever");
    const committed = commitInterviewTurn(initial, turn, { record: { ...initial.record, chief_complaints: ["fever"], still_missing: ["onset"] }, next_question: "I hear that — when did it start?" });
    const rolledBack = rollbackLastTurn(committed);
    expect(committed.turns[0]).toMatchObject({ turn_number: 1, question_asked: "What brings you in today?", transcript: "I have fever" });
    expect(rolledBack.record).toEqual(initial.record);
    expect(rolledBack.current_question).toBe("What brings you in today?");
    expect(rolledBack.turn_count).toBe(0);
  });

  it("updates summary fields without changing conversation history", () => {
    const session = createInterviewSession("Question");
    const updated = updateSessionRecord(session, "onset", "two days ago");
    expect(updated.record.onset).toBe("two days ago");
    expect(updated.record.still_missing).not.toContain("onset");
    expect(updated.turns).toEqual([]);
  });

  it("reconciles missing fields without deleting unrelated follow-up items", () => {
    const session = createInterviewSession("Question");
    session.record.still_missing = ["duration of fever", "medication history", "pain severity"];
    const filled = updateSessionRecord(session, "onset", "yesterday");
    expect(filled.record.still_missing).toEqual(["medication history", "pain severity"]);

    const cleared = updateSessionRecord(filled, "medication_history", "");
    expect(cleared.record.still_missing).toContain("medication history");
    expect(cleared.record.still_missing).toContain("pain severity");
  });
});
