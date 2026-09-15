const AGE_UNITS = new Set(["years", "months"]);
const SEX_VALUES = new Set(["female", "male", "intersex", "unknown", "prefer_not_to_say"]);
const PREGNANCY_VALUES = new Set(["pregnant", "possibly_pregnant", "not_pregnant", "not_applicable", "unknown"]);
const LACTATION_VALUES = new Set(["breastfeeding", "not_breastfeeding", "not_applicable", "unknown"]);
const THREE_WAY = new Set(["yes", "no", "unknown"]);
const ALLERGY_VALUES = new Set(["known", "none_known", "unknown"]);
const MEDICATION_VALUES = new Set(["current", "none", "unknown"]);

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers",
  "Sokoto", "Taraba", "Yobe", "Zamfara",
];

const text = (value, max = 1000) => String(value || "").trim().slice(0, max);
const numberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function normalizeClinicalProfile(value = {}) {
  value = value || {};
  const ageValue = numberOrNull(value.age_value);
  const weightKg = numberOrNull(value.weight_kg);
  return {
    age_value: ageValue,
    age_unit: text(value.age_unit, 12),
    age_years: ageValue == null ? null : value.age_unit === "months" ? ageValue / 12 : ageValue,
    weight_kg: weightKg,
    sex_at_birth: text(value.sex_at_birth, 32),
    state_of_residence: text(value.state_of_residence, 80),
    pregnancy_status: text(value.pregnancy_status, 32),
    lactation_status: text(value.lactation_status, 32),
    drug_allergy_status: text(value.drug_allergy_status, 32),
    drug_allergy_details: text(value.drug_allergy_details, 1200),
    medication_status: text(value.medication_status, 32),
    current_medications: text(value.current_medications, 1600),
    kidney_disease_status: text(value.kidney_disease_status, 16),
    liver_disease_status: text(value.liver_disease_status, 16),
    other_conditions: text(value.other_conditions, 1600),
    confirmed_by_patient: value.confirmed_by_patient === true,
    confirmed_at: text(value.confirmed_at, 64) || null,
  };
}

export function validateClinicalProfile(value) {
  const profile = normalizeClinicalProfile(value);
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  if (!AGE_UNITS.has(profile.age_unit)) add("age_unit", "Choose whether age is in years or months.");
  if (!Number.isInteger(profile.age_value) || profile.age_value < 0) add("age_value", "Enter age as a whole number.");
  if (profile.age_unit === "years" && profile.age_value > 130) add("age_value", "Enter an age from 0 to 130 years.");
  if (profile.age_unit === "months" && profile.age_value > 35) add("age_value", "Use years for patients aged 3 or older.");
  if (!SEX_VALUES.has(profile.sex_at_birth)) add("sex_at_birth", "Choose the sex recorded at birth, or choose unable to say.");
  if (!NIGERIAN_STATES.includes(profile.state_of_residence)) add("state_of_residence", "Choose the patient's state of residence.");
  if (!PREGNANCY_VALUES.has(profile.pregnancy_status)) add("pregnancy_status", "Record pregnancy status, including not applicable or unknown.");
  if (!LACTATION_VALUES.has(profile.lactation_status)) add("lactation_status", "Record breastfeeding status, including not applicable or unknown.");
  if (!ALLERGY_VALUES.has(profile.drug_allergy_status)) add("drug_allergy_status", "Record drug allergy status as known, none known, or unable to ascertain.");
  if (profile.drug_allergy_status === "known" && profile.drug_allergy_details.length < 3) add("drug_allergy_details", "Enter the medicine and what reaction happened.");
  if (!MEDICATION_VALUES.has(profile.medication_status)) add("medication_status", "Record whether the patient takes medicines, takes none, or is unable to say.");
  if (profile.medication_status === "current" && profile.current_medications.length < 2) add("current_medications", "List current prescribed, over-the-counter, herbal, and supplement products.");
  if (!THREE_WAY.has(profile.kidney_disease_status)) add("kidney_disease_status", "Record kidney disease status.");
  if (!THREE_WAY.has(profile.liver_disease_status)) add("liver_disease_status", "Record liver disease status.");
  if (profile.weight_kg != null && (profile.weight_kg < 0.5 || profile.weight_kg > 350)) add("weight_kg", "Enter a weight from 0.5 to 350 kg.");
  if (profile.age_years != null && profile.age_years < 18 && profile.weight_kg == null) add("weight_kg", "Weight is required for patients under 18.");
  if (!profile.confirmed_by_patient) add("confirmed_by_patient", "The patient or caregiver must confirm these details.");

  return { valid: errors.length === 0, profile, errors };
}

export function medicationHistoryFromProfile(value) {
  const profile = normalizeClinicalProfile(value);
  if (profile.medication_status === "none") return "None reported";
  if (profile.medication_status === "current") return profile.current_medications;
  return "";
}

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mentions = (textValue, term) => new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i").test(textValue);
const ALLERGY_GROUPS = [
  { drugs: ["amoxicillin", "ampicillin", "flucloxacillin", "penicillin"], terms: ["penicillin", "amoxicillin", "ampicillin", "flucloxacillin", "beta lactam"] },
  { drugs: ["cotrimoxazole", "septrin"], terms: ["cotrimoxazole", "septrin", "sulfa", "sulfonamide"] },
  { drugs: ["ibuprofen", "diclofenac", "naproxen", "aspirin"], terms: ["nsaid", "ibuprofen", "diclofenac", "naproxen", "aspirin"] },
];

export function assessPrescriptionContext(drug, value) {
  const validation = validateClinicalProfile(value);
  if (!validation.valid) return { ...validation, allergyMatch: null, warnings: [] };
  const profile = validation.profile;
  const prescribed = normalize(drug);
  const allergies = normalize(profile.drug_allergy_details);
  let allergyMatch = null;
  if (profile.drug_allergy_status === "known") {
    const directWords = prescribed.split(" ").filter((part) => part.length >= 4);
    if (directWords.some((part) => mentions(allergies, part))) allergyMatch = profile.drug_allergy_details;
    if (!allergyMatch) {
      const group = ALLERGY_GROUPS.find(({ drugs, terms }) => drugs.some((item) => mentions(prescribed, item)) && terms.some((item) => mentions(allergies, item)));
      if (group) allergyMatch = profile.drug_allergy_details;
    }
  }

  const warnings = [];
  if (profile.age_years < 18) warnings.push("This is a pediatric patient; verify the indication, formulation, weight-based dose, and maximum dose in an authoritative pediatric reference.");
  if (profile.age_years >= 65) warnings.push("This patient is 65 or older; review comorbidities, current medicines, organ function, and the medicine's geriatric labeling.");
  if (["pregnant", "possibly_pregnant", "unknown"].includes(profile.pregnancy_status)) warnings.push(`Pregnancy status is ${profile.pregnancy_status.replaceAll("_", " ")}; review pregnancy and reproductive-potential labeling.`);
  if (["breastfeeding", "unknown"].includes(profile.lactation_status)) warnings.push(`Breastfeeding status is ${profile.lactation_status.replaceAll("_", " ")}; review lactation labeling.`);
  if (["yes", "unknown"].includes(profile.kidney_disease_status)) warnings.push(`Kidney disease status is ${profile.kidney_disease_status}; verify renal function and renal dose guidance.`);
  if (["yes", "unknown"].includes(profile.liver_disease_status)) warnings.push(`Liver disease status is ${profile.liver_disease_status}; verify hepatic function and hepatic dose guidance.`);
  if (profile.drug_allergy_status === "unknown") warnings.push("Drug allergy status could not be ascertained.");
  if (profile.medication_status === "unknown") warnings.push("The current medication list could not be ascertained, so interaction checking is incomplete.");
  if (["unknown", "prefer_not_to_say"].includes(profile.sex_at_birth)) warnings.push("Sex recorded at birth was not available; review whether this affects medicine selection, monitoring, or dosing.");
  if (profile.drug_allergy_status === "known" && !allergyMatch) warnings.push(`A drug allergy is recorded: ${profile.drug_allergy_details}. Confirm that it is unrelated to the prescribed medicine.`);

  return { valid: true, profile, errors: [], allergyMatch, warnings };
}
