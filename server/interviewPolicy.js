export const MAX_INTERVIEW_TURNS = 7;

export function shouldCompleteInterview(turnCount, stillMissing) {
  return turnCount >= MAX_INTERVIEW_TURNS || (turnCount >= 2 && Array.isArray(stillMissing) && stillMissing.length === 0);
}
