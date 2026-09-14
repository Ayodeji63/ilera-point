import { isExplicitDenial, questionTopic, reconcileStillMissing } from "./interviewPolicy.js";

function didNotUnderstand(value = "") {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /do not understand|don't understand|did not understand|repeat|say again|ko ye mi|mi o ye|ban gane ba|agh otaghi m/.test(normalized);
}

// The model API is stateless. Rebuild one compact, authoritative memory object
// from the browser's complete session on every request so a server restart or a
// different Render instance cannot make the interviewer forget earlier turns.
export function buildInterviewMemory(turns, record) {
  const topicHistory = turns.map((turn) => {
    const topic = questionTopic(turn.question_asked);
    const understood = !didNotUnderstand(turn.transcript);
    return {
      turn_number: turn.turn_number,
      topic,
      question: turn.question_asked,
      answer: turn.transcript,
      understood,
      explicit_denial: understood && isExplicitDenial(turn.transcript),
    };
  });
  const answeredTopics = [...new Set(topicHistory
    .filter(({ topic, understood }) => topic !== "other" && understood)
    .map(({ topic }) => topic))];
  const explicitlyDeniedTopics = [...new Set(topicHistory
    .filter(({ topic, explicit_denial: denied }) => topic !== "other" && denied)
    .map(({ topic }) => topic))];
  const stillMissing = reconcileStillMissing(record, turns);

  return {
    clinical_record: { ...record, still_missing: stillMissing },
    answered_topics: answeredTopics,
    explicitly_denied_topics: explicitlyDeniedTopics,
    unresolved_items: stillMissing,
    topic_history: topicHistory,
    latest_turn: topicHistory.at(-1) || null,
  };
}
