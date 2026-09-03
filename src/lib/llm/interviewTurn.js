export async function interviewTurn(turns, record, languageCode, signal) {
  const response = await fetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turns, record, languageCode }),
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "We could not save that answer. Please try again.");
  return body;
}
