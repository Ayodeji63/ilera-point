-- Patient identity moves from Tencent PalmAI to Tencent Cloud Face Recognition.
-- palm_reference is kept rather than dropped so no existing data is destroyed,
-- but it is no longer read: a palm reference cannot be converted into a face,
-- so patients enrolled by palm must enrol their face once.
alter table public.patients add column if not exists face_person_id text;

-- The patient now waits at the kiosk to collect their prescription. They have no
-- account, so the kiosk holds this capability token for the length of the visit
-- and reads back only its own consultation with it.
alter table public.consultations add column if not exists patient_token text;
create index if not exists consultations_patient_token_idx on public.consultations(patient_token);
