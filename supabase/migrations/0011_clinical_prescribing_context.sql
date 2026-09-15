-- Catch-up repair plus auditable prescribing context. Safe to run even when
-- 0005 was already applied.
alter table public.prescriptions add column if not exists interaction_override jsonb;
alter table public.prescriptions add column if not exists patient_context_snapshot jsonb not null default '{}'::jsonb;
alter table public.prescriptions add column if not exists patient_factors_confirmed boolean not null default false;
alter table public.prescriptions add column if not exists clinical_context_acknowledgement jsonb;

comment on column public.prescriptions.patient_context_snapshot is
  'Visit-specific age, weight, sex-at-birth, pregnancy/lactation, allergy, medicine, renal, hepatic, and condition context visible to the prescriber at confirmation.';
comment on column public.prescriptions.patient_factors_confirmed is
  'True only when the clinician explicitly confirms reviewing the patient context before the write.';

-- Supabase/PostgREST normally notices DDL automatically; this removes the
-- stale schema-cache delay after running the migration in the SQL editor.
notify pgrst, 'reload schema';
