export const EMPTY_RECORD = {
  chief_complaints: [],
  onset: "",
  associated_symptoms: [],
  negative_symptoms_checked: [],
  medication_history: "",
  still_missing: ["main concern", "onset", "associated symptoms", "medication history"],
};

function copyRecord(record) {
  return {
    ...record,
    chief_complaints: [...(record.chief_complaints || [])],
    associated_symptoms: [...(record.associated_symptoms || [])],
    negative_symptoms_checked: [...(record.negative_symptoms_checked || [])],
    still_missing: [...(record.still_missing || [])],
  };
}

export function createInterviewSession(firstQuestion) {
  return { turns: [], record: copyRecord(EMPTY_RECORD), turn_count: 0, current_question: firstQuestion, record_snapshots: [] };
}

export function createTurn(session, transcript) {
  return { turn_number: session.turn_count + 1, question_asked: session.current_question, transcript: transcript.trim(), timestamp: new Date().toISOString() };
}

export function commitInterviewTurn(session, turn, result) {
  return {
    turns: [...session.turns, turn],
    record: copyRecord(result.record),
    turn_count: session.turn_count + 1,
    current_question: result.next_question,
    record_snapshots: [...session.record_snapshots, copyRecord(session.record)],
  };
}

export function rollbackLastTurn(session) {
  if (!session?.turns.length) return session;
  const removedTurn = session.turns.at(-1);
  return {
    turns: session.turns.slice(0, -1),
    record: copyRecord(session.record_snapshots.at(-1) || EMPTY_RECORD),
    turn_count: Math.max(0, session.turn_count - 1),
    current_question: removedTurn.question_asked,
    record_snapshots: session.record_snapshots.slice(0, -1),
  };
}

export function updateSessionRecord(session, field, value) {
  const missingPatterns = {
    chief_complaints: /(main concern|chief complaint|presenting complaint)/i,
    onset: /(onset|when.*start|duration)/i,
    associated_symptoms: /(associated symptom|other symptom)/i,
    medication_history: /(medication|medicine)/i,
  };
  const pattern = missingPatterns[field];
  let stillMissing = [...session.record.still_missing];
  if (pattern) stillMissing = stillMissing.filter((item) => !pattern.test(item));

  const isEmpty = Array.isArray(value) ? value.length === 0 : !String(value).trim();
  const missingLabels = { chief_complaints: "main concern", onset: "onset", medication_history: "medication history" };
  if (isEmpty && missingLabels[field]) stillMissing.push(missingLabels[field]);

  return { ...session, record: copyRecord({ ...session.record, [field]: value, still_missing: [...new Set(stillMissing)] }) };
}
