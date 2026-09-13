-- The patient waits at the kiosk to collect their prescription. They have no
-- account, so the kiosk holds this capability token for the length of the visit
-- and reads back only its own consultation with it.
alter table public.consultations add column if not exists patient_token text;
create index if not exists consultations_patient_token_idx on public.consultations(patient_token);
