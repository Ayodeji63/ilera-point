const LABELS = {
  female: "Female", male: "Male", intersex: "Intersex", unknown: "Unable to ascertain",
  prefer_not_to_say: "Patient preferred not to say", pregnant: "Pregnant",
  possibly_pregnant: "Pregnancy possible", not_pregnant: "Not pregnant",
  not_applicable: "Not applicable", breastfeeding: "Breastfeeding",
  not_breastfeeding: "Not breastfeeding", known: "Known allergy", none_known: "No known drug allergy",
  current: "Takes current medicines", none: "No current medicines", yes: "Yes", no: "No",
};

export const statusLabel = (value) => LABELS[value] || (value ? String(value).replaceAll("_", " ") : "Not recorded");

export function ageLabel(profile) {
  if (profile?.age_value == null) return "Not recorded";
  return `${profile.age_value} ${profile.age_unit}`;
}

export function profileRows(profile) {
  if (!profile) return [];
  return [
    ["Age", ageLabel(profile)],
    ["Weight", profile.weight_kg == null ? "Not recorded" : `${profile.weight_kg} kg`],
    ["Sex recorded at birth", statusLabel(profile.sex_at_birth)],
    ["State", profile.state_of_residence || "Not recorded"],
    ["Pregnancy", statusLabel(profile.pregnancy_status)],
    ["Breastfeeding", statusLabel(profile.lactation_status)],
    ["Drug allergies", profile.drug_allergy_status === "known" ? profile.drug_allergy_details : statusLabel(profile.drug_allergy_status)],
    ["Current medicines", profile.medication_status === "current" ? profile.current_medications : statusLabel(profile.medication_status)],
    ["Kidney disease", statusLabel(profile.kidney_disease_status)],
    ["Liver disease", statusLabel(profile.liver_disease_status)],
    ["Other conditions", profile.other_conditions || "None reported"],
  ];
}

export default function ClinicalProfileDetails({ profile, compact = false }) {
  if (!profile) return <p className="font-bold text-[#8b311f]">Patient prescribing details were not collected for this visit.</p>;
  return <dl className={compact ? "mt-3" : "mt-4 grid gap-x-6 sm:grid-cols-2"}>
    {profileRows(profile).map(([label, value]) => <div key={label} className="border-b border-[#d8e1dc] py-3">
      <dt className="text-sm font-black uppercase tracking-[.08em] text-[#527269]">{label}</dt>
      <dd className="mt-1 overflow-wrap-anywhere font-extrabold text-[#103f33]">{value}</dd>
    </div>)}
  </dl>;
}
