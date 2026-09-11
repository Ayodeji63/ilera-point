// Nigeria has run a national Task Shifting and Task Sharing policy since 2014.
// It already says which primary care a CHEW or CHO may deliver; what has been
// missing is anything that routes a patient to the right tier automatically.
// This does that, and only that.
//
// The rule is deterministic and lives outside the model on purpose. Gemini never
// decides who may see a case: it cannot be argued with, hallucinated around, or
// prompt-injected into sending an emergency to a community health worker. What
// requires a doctor is a static reference list, reviewed by a clinician, not
// something inferred at request time.
export const DOCTOR_ONLY_PRESENTATIONS = new Set([
  "pregnancy",
  "pregnant",
  "vaginal bleeding",
  "severe abdominal pain",
  "jaundice",
  "convulsion",
  "convulsions",
  "unexplained weight loss",
  "coughing blood",
  "blood in stool",
  "blood in urine",
  "suicidal thoughts",
  "self harm",
  "mental health crisis",
  "broken bone",
  "fracture",
  "deep wound",
  "burn",
  "snake bite",
  "poisoning",
]);

// Ongoing therapy a community health worker may not adjust unsupervised.
export const DOCTOR_ONLY_MEDICATIONS = new Set([
  "insulin",
  "warfarin",
  "antiretroviral",
  "arv",
  "tuberculosis",
  "tb treatment",
  "chemotherapy",
  "methotrexate",
  "lithium",
  "digoxin",
]);

export const CLINICAL_TIERS = ["chew", "doctor"];
// Which staff role may work which queue. A doctor sees everything; a community
// health worker sees only what has been routed to their tier.
const TIER_BY_ROLE = { chew: "chew", cho: "chew", nurse: "chew", doctor: "doctor", admin: "doctor" };

// An unrecognised role gets the narrowest queue, never the widest: a typo in a
// role column must not hand someone every patient record in the clinic.
export function tierForRole(role) {
  return TIER_BY_ROLE[role] || "chew";
}

export function canSeeEveryTier(role) {
  return tierForRole(role) === "doctor";
}

// Listing by tier is not enough on its own: a case id is guessable-ish and the
// detail route returns the full transcript and the consented video. Every route
// that reads or acts on one case checks this too.
export function canWorkCase(role, assignedTier) {
  if (canSeeEveryTier(role)) return true;
  return tierForRole(role) === (assignedTier || "doctor");
}

function matches(values, reference) {
  return values
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase().trim())
    .filter((value) => reference.has(value));
}

// Returns the tier a completed interview should be routed to, and why. The
// reasons are recorded so a clinician can see what the routing was based on
// rather than having to trust it.
export function routeConsultation({ record = {}, redFlagStatus = {} } = {}) {
  const reasons = [];
  if (redFlagStatus.emergency) {
    reasons.push(...(redFlagStatus.triggers || []).map((trigger) => `emergency: ${trigger}`));
  }

  const symptoms = [...(record.chief_complaints || []), ...(record.associated_symptoms || [])];
  reasons.push(...matches(symptoms, DOCTOR_ONLY_PRESENTATIONS).map((hit) => `doctor-only presentation: ${hit}`));

  const medication = String(record.medication_history || "").toLowerCase();
  for (const drug of DOCTOR_ONLY_MEDICATIONS) {
    if (medication.includes(drug)) reasons.push(`doctor-only medication: ${drug}`);
  }

  return { tier: reasons.length ? "doctor" : "chew", reasons };
}
