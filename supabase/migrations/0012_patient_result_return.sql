-- Resumable, privacy-preserving patient result collection.
-- Apply after 0011_clinical_prescribing_context.sql.

alter table public.consultations add column if not exists patient_return_code_hash text;
alter table public.consultations add column if not exists patient_result_expires_at timestamptz;

create unique index if not exists consultations_patient_return_code_hash_idx
  on public.consultations(patient_return_code_hash)
  where patient_return_code_hash is not null;

create index if not exists consultations_patient_result_expiry_idx
  on public.consultations(patient_result_expires_at)
  where patient_result_expires_at is not null;

notify pgrst, 'reload schema';
