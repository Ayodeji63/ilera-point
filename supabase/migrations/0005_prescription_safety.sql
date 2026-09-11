-- When a clinician prescribes past an interaction warning, the warning they
-- overrode is stored with the prescription. The check never blocks outright —
-- clinical judgement wins — but the override is part of the record.
alter table public.prescriptions add column if not exists interaction_override jsonb;
