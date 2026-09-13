-- Remove legacy identity-provider references from databases upgraded from an
-- earlier IleraPoint build. Patient access now uses name or phone only.
alter table public.patients drop column if exists face_person_id;
alter table public.patients drop column if exists palm_reference;
