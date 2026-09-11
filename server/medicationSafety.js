// A prescribing check, not a diagnosis. Like checkRedFlags and careRouting, this
// is a deterministic lookup against a static list that a clinician reviews — the
// model is not consulted and cannot influence it.
//
// It is deliberately small and conservative. Every pair here is a well
// established interaction; the list is not a substitute for a formulary, and the
// clinician can always proceed after acknowledging a warning, because a blanket
// block would be its own kind of unsafe.

const NSAIDS = ["ibuprofen", "diclofenac", "naproxen", "aspirin", "indomethacin", "piroxicam"];

// Each rule: taking `whenTaking` and being prescribed `andPrescribed` is a
// documented interaction worth stopping to read.
export const INTERACTIONS = [
  { whenTaking: ["warfarin"], andPrescribed: NSAIDS, risk: "raises bleeding risk" },
  { whenTaking: ["warfarin"], andPrescribed: ["metronidazole", "fluconazole", "ciprofloxacin", "cotrimoxazole", "septrin"], risk: "raises INR and bleeding risk" },
  { whenTaking: ["methotrexate"], andPrescribed: [...NSAIDS, "trimethoprim", "cotrimoxazole", "septrin"], risk: "raises methotrexate toxicity" },
  { whenTaking: ["lisinopril", "enalapril", "ramipril", "losartan"], andPrescribed: ["spironolactone", "potassium", "amiloride"], risk: "raises potassium to dangerous levels" },
  { whenTaking: ["lisinopril", "enalapril", "ramipril", "losartan"], andPrescribed: NSAIDS, risk: "reduces kidney function and blood pressure control" },
  { whenTaking: ["metformin"], andPrescribed: ["contrast", "iodinated contrast"], risk: "risk of lactic acidosis around imaging" },
  { whenTaking: ["digoxin"], andPrescribed: ["furosemide", "bendroflumethiazide", "hydrochlorothiazide"], risk: "potassium loss raises digoxin toxicity" },
  { whenTaking: ["phenytoin", "carbamazepine"], andPrescribed: ["fluconazole", "isoniazid"], risk: "raises anticonvulsant levels" },
  { whenTaking: ["simvastatin", "atorvastatin"], andPrescribed: ["clarithromycin", "erythromycin", "itraconazole"], risk: "raises risk of muscle breakdown" },
  { whenTaking: ["theophylline"], andPrescribed: ["ciprofloxacin", "erythromycin"], risk: "raises theophylline toxicity" },
];

function mentions(text, term) {
  // Word-boundary match so "aspirin" does not fire on an unrelated substring.
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text);
}

export function checkPrescription(drug, medicationHistory) {
  const prescribed = String(drug || "").toLowerCase().trim();
  const history = String(medicationHistory || "").toLowerCase();
  if (!prescribed || !history) return { conflicts: [], duplicate: false };

  const conflicts = [];
  for (const rule of INTERACTIONS) {
    const taking = rule.whenTaking.find((term) => mentions(history, term));
    const clashes = rule.andPrescribed.find((term) => mentions(prescribed, term));
    if (taking && clashes) conflicts.push({ taking, prescribed: clashes, risk: rule.risk });
  }

  // Prescribing something the patient reports already taking is worth a pause of
  // its own: it is the commonest way a dose gets accidentally doubled.
  const duplicate = prescribed.split(/[\s,/]+/).some((word) => word.length > 3 && mentions(history, word));

  return { conflicts, duplicate };
}

export function interactionWarning({ conflicts, duplicate }) {
  if (!conflicts.length && !duplicate) return null;
  const lines = conflicts.map(({ taking, prescribed, risk }) => `${prescribed} with ${taking}: ${risk}`);
  if (duplicate) lines.push("The patient already reports taking this medicine, so this may double their dose.");
  return lines.join(" · ");
}
