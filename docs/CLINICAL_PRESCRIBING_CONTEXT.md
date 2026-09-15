# Clinical prescribing context: research and implementation report

Version: 2026-09-15  
Scope: patient intake facts that must be visible and explicitly reviewed before IleraPoint writes a prescription.

## Decision

IleraPoint now collects a visit-specific, patient- or caregiver-confirmed prescribing context before consent, sensors, and the voice interview. It records age (years or months), pediatric weight, sex recorded at birth, state of residence, pregnancy possibility, breastfeeding, drug-allergy status and reaction, current prescribed/over-the-counter/herbal/supplement products, kidney disease, liver disease, and other diagnosed conditions.

These facts are not an automatic dose calculator. The system does not infer pregnancy from sex, does not convert “unknown” to “none,” and does not tell the clinician that a dose is correct. The clinician sees the snapshot next to the prescription, explicitly confirms reviewing it, and must use an authoritative drug monograph and the clinical assessment.

## Why these fields were selected

| Context | Evidence | Implementation consequence |
|---|---|---|
| Drug allergy status and reaction | NICE recommends the explicit states drug allergy, none known, or unable to ascertain; at minimum a recorded allergy includes the drug, reaction/severity, and date, and the status is confirmed before prescribing. [NICE CG183](https://www.nice.org.uk/guidance/cg183/chapter/Recommendations) | The patient chooses known, none known, or unable to ascertain. A known allergy requires the medicine and reaction. A direct/class-level match blocks the write and requires re-assessment. Date remains a documented limitation for this MVP. |
| Prescription, OTC, and complementary products | NICE medicines optimisation includes prescribed, over-the-counter, and complementary medicines in structured review. [NICE NG5](https://www.nice.org.uk/guidance/NG5/chapter/recommendations) | The question explicitly includes all four categories. A confirmed list seeds interview memory; “unable to ascertain” remains visibly unknown. |
| Age and pediatric weight | WHO notes that medicines for children must be adjusted to the child's age, weight, and needs; pediatric medication errors have disproportionate risk. [WHO child medicines guidance](https://www.who.int/news/item/11-12-2010-new-who-guidance-to-improve-use-of-medicines-for-children) | Age is mandatory and can be entered in months. Weight is mandatory below 18; pediatric prescriptions require an explicit reference-review acknowledgement. |
| Pregnancy, lactation, reproductive potential | Prescription labeling separates pregnancy, lactation, reproductive potential, pediatric, geriatric, renal, and hepatic considerations. [FDA labeling FAQ](https://www.fda.gov/drugs/fdas-labeling-resources-human-prescription-drugs/frequently-asked-questions-about-labeling-prescription-medicines) | Pregnancy and breastfeeding are explicit questions with not-applicable and unknown options; they are never inferred from sex. Relevant or unknown status creates a review warning. |
| Renal and hepatic function | Dose and administration information may require modifications for renal/hepatic impairment and interacting medicines. [FDA prescribing-label guide](https://www.fda.gov/about-fda/oncology-center-excellence/how-do-i-use-prescription-drug-labeling) | Kidney/liver status is mandatory as yes/no/unknown. Yes or unknown requires clinician acknowledgement; the MVP does not calculate renal function. |
| Contraindications, interactions, high-risk groups | WHO's Guide to Good Prescribing frames safety around contraindications, interactions, and high-risk groups. [WHO Guide to Good Prescribing](https://iris.who.int/bitstream/handle/10665/59001/WHO_DAP_94.11.pdf) | The profile is displayed before the committing action, while existing deterministic medication-history matching remains a limited, separately acknowledged reference. |
| Nigerian formulary context | The Federal Ministry of Health and Social Welfare publishes the Nigeria Essential Medicines List for Adults, 8th edition (2024). [Nigeria NEML](https://www.health.gov.ng/wp-content/uploads/2025/08/Final-NEML-Adult-8th-Edition.pdf) | The dictation parser's conservative formulary remains based on the primary-care subset. The list does not itself establish indication or dose suitability. |

## Safety behavior

1. The API refuses to save a consultation without a complete confirmed profile.
2. The profile is preserved verbatim across Gemini interview turns; the model cannot rewrite it.
3. Confirmed current medicines prefill `medication_history`, preventing the interviewer from repeatedly reopening that topic.
4. A prescription cannot be written until the clinician checks the patient-factor confirmation.
5. A direct or supported class-level drug-allergy match blocks the write. The clinician must re-assess/correct the record or choose another clinically appropriate medicine.
6. Pediatric/older age, pregnancy/lactation relevance or uncertainty, renal/hepatic risk or uncertainty, unknown allergy/medicine status, and known unrelated allergies produce visible warnings that require a separate acknowledgement.
7. The written prescription stores the visit snapshot and any acknowledgement beside the dictation/parse audit fields.

## Data and privacy design

The profile is stored inside the consultation's `structured_record`, not as an unchanging demographic claim on the patient directory. Pregnancy, breastfeeding, medicines, allergies, weight, organ status, and state can change, so the kiosk confirms them for each visit. This also prevents a returning-patient lookup response from exposing those health facts.

Only approved clinicians can read the consultation. The prescription stores `patient_context_snapshot` so later changes cannot make the historical prescribing decision appear to have used different facts. Audit metadata records that confirmation occurred but does not copy the clinical content.

## Important limits

- This is a completeness and review gate, not comprehensive clinical decision support.
- Exact age and weight do not validate a dose without indication, formulation, route, renal/hepatic measurements where relevant, interactions, laboratory data, and the medicine's current authoritative monograph.
- The static allergy matcher recognizes only direct drug names and a few conservative class aliases. It can miss allergy relationships and must not replace clinical review.
- “Kidney disease” and “liver disease” are screening questions; they do not replace eGFR, creatinine clearance, liver tests, or severity assessment.
- Allergy onset/date, detailed past medical history, immunization status, prior adverse reactions distinct from allergy, alcohol/substance exposure, and diagnosis-specific tests remain future structured fields. A clinician must obtain them when relevant.
- State of residence is contextual information requested by the product owner; it is not represented as a general dose-determining factor.

## Deployment

Apply migrations in order, including [`0011_clinical_prescribing_context.sql`](../supabase/migrations/0011_clinical_prescribing_context.sql). Migration 0011 safely repairs a missing `interaction_override`, adds the prescribing-context audit columns, and asks PostgREST to reload its schema cache. Existing consultations without a confirmed profile remain reviewable but cannot create a new IleraPoint prescription; they require patient re-assessment.
