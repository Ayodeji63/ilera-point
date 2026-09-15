import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, ClipboardCheck, ShieldCheck } from "lucide-react";
import BrandHeader from "./BrandHeader";
import ClinicalProfileDetails from "./ClinicalProfileDetails";
import { NIGERIAN_STATES, normalizeClinicalProfile, validateClinicalProfile } from "../../shared/clinicalProfile.js";

const EMPTY = {
  age_value: "", age_unit: "years", weight_kg: "", sex_at_birth: "", state_of_residence: "",
  pregnancy_status: "", lactation_status: "", drug_allergy_status: "", drug_allergy_details: "",
  medication_status: "", current_medications: "", kidney_disease_status: "", liver_disease_status: "",
  other_conditions: "", confirmed_by_patient: false,
};

const OPTIONS = {
  sex_at_birth: [["female", "Female"], ["male", "Male"], ["intersex", "Intersex"], ["unknown", "Unable to ascertain"], ["prefer_not_to_say", "Prefer not to say"]],
  pregnancy_status: [["pregnant", "Pregnant"], ["possibly_pregnant", "Pregnancy is possible"], ["not_pregnant", "Not pregnant"], ["not_applicable", "Not applicable"], ["unknown", "Unsure / unable to ascertain"]],
  lactation_status: [["breastfeeding", "Breastfeeding"], ["not_breastfeeding", "Not breastfeeding"], ["not_applicable", "Not applicable"], ["unknown", "Unsure / unable to ascertain"]],
  drug_allergy_status: [["none_known", "No known drug allergy"], ["known", "Yes — a medicine caused a reaction"], ["unknown", "Unable to ascertain"]],
  medication_status: [["none", "No current medicines"], ["current", "Yes — currently taking medicines"], ["unknown", "Unable to ascertain"]],
  three_way: [["no", "No"], ["yes", "Yes"], ["unknown", "Unable to ascertain"]],
};
const STEPS = ["About you", "Allergies and medicines", "Health conditions", "Review and confirm"];
const STEP_FIELDS = [
  new Set(["age_value", "age_unit", "weight_kg", "sex_at_birth", "state_of_residence", "pregnancy_status", "lactation_status"]),
  new Set(["drug_allergy_status", "drug_allergy_details", "medication_status", "current_medications"]),
  new Set(["kidney_disease_status", "liver_disease_status", "other_conditions"]),
];

export default function MedicalProfileScreen({ patient, language, onLanguageChange, initialProfile, onBack, onComplete }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initialProfile || {}) }));
  const [errors, setErrors] = useState([]);
  const [step, setStep] = useState(0);
  const ageYears = useMemo(() => form.age_value === "" ? null : Number(form.age_value) / (form.age_unit === "months" ? 12 : 1), [form.age_unit, form.age_value]);
  const errorFor = (field) => errors.find((item) => item.field === field)?.message;
  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value, confirmed_by_patient: field === "confirmed_by_patient" ? value : false }));
    setErrors((current) => current.filter((item) => item.field !== field && item.field !== "confirmed_by_patient"));
  };
  const goBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setErrors([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else onBack();
  };
  const candidate = (confirmed = form.confirmed_by_patient) => normalizeClinicalProfile({ ...form, confirmed_by_patient: confirmed, confirmed_at: new Date().toISOString() });
  const nextStep = () => {
    const validation = validateClinicalProfile(candidate(true));
    const stepErrors = validation.errors.filter(({ field }) => STEP_FIELDS[step]?.has(field));
    if (stepErrors.length) {
      setErrors(stepErrors);
      document.querySelector(`[name="${stepErrors[0].field}"]`)?.focus();
      return;
    }
    setErrors([]);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const submit = (event) => {
    event.preventDefault();
    if (step < STEPS.length - 1) return nextStep();
    const candidate = normalizeClinicalProfile({ ...form, confirmed_at: new Date().toISOString() });
    const validation = validateClinicalProfile(candidate);
    if (!validation.valid) {
      setErrors(validation.errors);
      document.querySelector(`[name="${validation.errors[0].field}"]`)?.focus();
      return;
    }
    onComplete(validation.profile);
  };

  return <main className="kiosk-shell min-h-[100dvh]">
    <BrandHeader compact language={language} onLanguageChange={onLanguageChange} />
    <section className="relative z-10 mx-auto grid max-w-[1180px] items-start gap-6 px-5 pb-12 lg:grid-cols-[.72fr_1.28fr] lg:px-10">
      <aside className="route-panel hidden rounded-[16px] bg-[#103f33] p-6 text-white lg:sticky lg:top-5 lg:block lg:p-9">
        <button type="button" onClick={goBack} className="flex min-h-12 items-center gap-2 font-black text-[#b8d5cc]"><ArrowLeft size={21} />{step > 0 ? "Previous questions" : "Back"}</button>
        <ClipboardCheck className="mt-5 text-[#f2d533]" size={42} />
        <h1 className="mt-4 text-balance text-[clamp(2.4rem,3.4vw,3.6rem)] font-black leading-[.96] tracking-[-.04em]">Confirm the health details medicines depend on.</h1>
        <p className="mt-4 text-lg font-semibold leading-relaxed text-[#b8d5cc]">{patient?.name}, answer for today. Pregnancy, medicines, allergies, and some conditions can change, so returning patients confirm them again each visit.</p>
        <div className="mt-6 border-t border-white/20 pt-4">
          <h2 className="text-xl font-black">Why we ask</h2>
          <p className="mt-2 font-semibold leading-relaxed text-[#b8d5cc]">These answers help the clinician spot dose and safety questions. They do not diagnose you and do not let the software choose a medicine.</p>
        </div>
        <ol className="mt-5 border-t border-white/20 pt-4" aria-label="Health details progress">{STEPS.map((label, index) => <li key={label} className={`flex items-center gap-3 py-2 font-black ${index === step ? "text-white" : index < step ? "text-[#dcebe6]" : "text-[#85a69c]"}`}><span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm ${index === step ? "bg-[#f2d533] text-[#103f33]" : index < step ? "bg-[#1d6e59] text-white" : "bg-white/10"}`}>{index < step ? <Check size={16} /> : index + 1}</span>{label}</li>)}</ol>
      </aside>

      <form onSubmit={submit} noValidate className="rounded-[16px] bg-white p-6 shadow-[0_16px_40px_rgba(16,63,51,.1)] md:p-9">
        <button type="button" onClick={goBack} className="mb-5 flex min-h-12 items-center gap-2 font-black text-[#527269] lg:hidden"><ArrowLeft size={21} />{step > 0 ? "Previous questions" : "Back"}</button>
        <div className="flex items-start gap-3"><ShieldCheck className="mt-1 shrink-0 text-[#1d6e59]" /><div><p className="font-black text-[#1d6e59]">Step {step + 1} of {STEPS.length}</p><h2 className="mt-1 text-3xl font-black tracking-[-.03em] text-[#103f33]">{STEPS[step]}</h2><p className="mt-2 max-w-2xl font-semibold leading-relaxed text-[#527269]">{step === STEPS.length - 1 ? "Check every answer before it is attached to this visit." : "Choose “unable to ascertain” when you do not know. That is safer than guessing or recording “none.”"}</p></div></div>

        <fieldset className={`${step === 0 ? "mt-7" : "hidden"} border-t border-[#d8e1dc] pt-6`}><legend className="text-xl font-black text-[#103f33]">Age and body details</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><label className="font-black text-[#103f33]">Age<div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><input name="age_value" required type="number" min="0" max={form.age_unit === "months" ? "35" : "130"} step="1" inputMode="numeric" value={form.age_value} onChange={(event) => update("age_value", event.target.value)} aria-invalid={Boolean(errorFor("age_value"))} className="min-h-14 min-w-0 rounded-[14px] bg-[#f1f3ee] px-4 font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff]" /><select name="age_unit" value={form.age_unit} onChange={(event) => update("age_unit", event.target.value)} className="min-h-14 rounded-[14px] bg-[#f1f3ee] px-3 font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff]"><option value="years">Years</option><option value="months">Months</option></select></div></label><FieldError text={errorFor("age_value") || errorFor("age_unit")} /></div>
            <div><label className="font-black text-[#103f33]">Weight in kg <span className="font-semibold text-[#527269]">{ageYears != null && ageYears < 18 ? "(required under 18)" : "(if known)"}</span><input name="weight_kg" type="number" min="0.5" max="350" step="0.1" inputMode="decimal" value={form.weight_kg ?? ""} onChange={(event) => update("weight_kg", event.target.value)} aria-invalid={Boolean(errorFor("weight_kg"))} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff]" /></label><FieldError text={errorFor("weight_kg")} /></div>
            <SelectField name="sex_at_birth" label="Sex recorded at birth" help="Used only where it changes clinical safety." value={form.sex_at_birth} options={OPTIONS.sex_at_birth} onChange={update} error={errorFor("sex_at_birth")} />
            <SelectField name="state_of_residence" label="State of residence" value={form.state_of_residence} options={NIGERIAN_STATES.map((state) => [state, state])} onChange={update} error={errorFor("state_of_residence")} />
          </div>
        </fieldset>

        <fieldset className={`${step === 0 ? "mt-7" : "hidden"} border-t border-[#d8e1dc] pt-6`}><legend className="text-xl font-black text-[#103f33]">Pregnancy and breastfeeding</legend><p className="mt-2 font-semibold text-[#527269]">Answer both, including “not applicable.” The kiosk does not infer these answers from sex.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField name="pregnancy_status" label="Could you be pregnant now?" value={form.pregnancy_status} options={OPTIONS.pregnancy_status} onChange={update} error={errorFor("pregnancy_status")} /><SelectField name="lactation_status" label="Are you breastfeeding?" value={form.lactation_status} options={OPTIONS.lactation_status} onChange={update} error={errorFor("lactation_status")} /></div>
        </fieldset>

        <fieldset className={`${step === 1 ? "mt-7" : "hidden"} border-t border-[#d8e1dc] pt-6`}><legend className="text-xl font-black text-[#103f33]">Allergies and medicines</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField name="drug_allergy_status" label="Drug allergy status" value={form.drug_allergy_status} options={OPTIONS.drug_allergy_status} onChange={update} error={errorFor("drug_allergy_status")} /><SelectField name="medication_status" label="Current medicines" value={form.medication_status} options={OPTIONS.medication_status} onChange={update} error={errorFor("medication_status")} /></div>
          {form.drug_allergy_status === "known" && <TextField name="drug_allergy_details" label="Which medicine, and what happened?" help="Include the reaction and severity if known." value={form.drug_allergy_details} onChange={update} error={errorFor("drug_allergy_details")} />}
          {form.medication_status === "current" && <TextField name="current_medications" label="List everything taken now" help="Include prescriptions, medicines bought without a prescription, herbal remedies, and supplements." value={form.current_medications} onChange={update} error={errorFor("current_medications")} />}
        </fieldset>

        <fieldset className={`${step === 2 ? "mt-7" : "hidden"} border-t border-[#d8e1dc] pt-6`}><legend className="text-xl font-black text-[#103f33]">Conditions that can affect a dose</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField name="kidney_disease_status" label="Kidney disease or reduced kidney function?" value={form.kidney_disease_status} options={OPTIONS.three_way} onChange={update} error={errorFor("kidney_disease_status")} /><SelectField name="liver_disease_status" label="Liver disease or reduced liver function?" value={form.liver_disease_status} options={OPTIONS.three_way} onChange={update} error={errorFor("liver_disease_status")} /></div>
          <TextField name="other_conditions" label="Other diagnosed conditions" help="Optional. For example diabetes, high blood pressure, asthma, seizures, or sickle cell disease." value={form.other_conditions} onChange={update} />
        </fieldset>

        {step === 3 && <div className="mt-6"><ClinicalProfileDetails profile={candidate(false)} /><label className="mt-7 flex cursor-pointer items-start gap-3 rounded-[14px] bg-[#e7f1ed] p-5 font-bold leading-relaxed text-[#103f33]"><input name="confirmed_by_patient" type="checkbox" checked={form.confirmed_by_patient} onChange={(event) => update("confirmed_by_patient", event.target.checked)} className="mt-1 size-5 shrink-0 accent-[#1d6e59]" /><span>I have checked these answers, or a caregiver checked them with me, and they are correct for today.</span></label><FieldError text={errorFor("confirmed_by_patient")} /></div>}
        {errors.length > 0 && <div role="alert" className="mt-5 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]">Please correct the highlighted detail. Unknown is an acceptable answer when it is selected explicitly.</div>}
        <button className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-[14px] bg-[#f2d533] px-5 text-lg font-black text-[#103f33] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff]">{step === STEPS.length - 1 ? <Check /> : <ChevronRight />}{step === STEPS.length - 1 ? "Confirm details and continue" : `Continue to ${STEPS[step + 1].toLowerCase()}`}</button>
      </form>
    </section>
  </main>;
}

function SelectField({ name, label, help, value, options, onChange, error }) {
  return <div><label className="block font-black text-[#103f33]">{label}{help && <span className="mt-1 block text-sm font-semibold text-[#527269]">{help}</span>}<select name={name} required value={value} onChange={(event) => onChange(name, event.target.value)} aria-invalid={Boolean(error)} className="mt-2 min-h-14 w-full rounded-[14px] bg-[#f1f3ee] px-4 font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff]"><option value="">Choose one</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label><FieldError text={error} /></div>;
}

function TextField({ name, label, help, value, onChange, error }) {
  return <div className="mt-4"><label className="block font-black text-[#103f33]">{label}{help && <span className="mt-1 block text-sm font-semibold text-[#527269]">{help}</span>}<textarea name={name} rows="3" value={value} onChange={(event) => onChange(name, event.target.value)} aria-invalid={Boolean(error)} className="mt-2 w-full resize-y rounded-[14px] bg-[#f1f3ee] p-4 font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0a78ff]" /></label><FieldError text={error} /></div>;
}

function FieldError({ text }) {
  return text ? <p className="mt-2 text-sm font-bold text-[#8b311f]">{text}</p> : null;
}
