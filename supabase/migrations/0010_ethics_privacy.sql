-- Ethics, privacy, inclusion, retention, and audit controls.
-- Apply after 0009_prescription_dictation.sql.

alter table public.patients add column if not exists phone_normalized text;
update public.patients
set phone_normalized = regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g')
where phone_normalized is null and phone is not null;
update public.patients set phone_normalized = '0' || substring(phone_normalized from 5) where phone_normalized like '+234%';
update public.patients set phone_normalized = '0' || substring(phone_normalized from 4) where phone_normalized like '234%';
create index if not exists patients_phone_normalized_idx on public.patients(phone_normalized);

alter table public.consultations add column if not exists patient_token_hash text;
alter table public.consultations add column if not exists patient_token_expires_at timestamptz;
alter table public.consultations add column if not exists patient_token_consumed_at timestamptz;
alter table public.consultations add column if not exists consent_notice_version text;
alter table public.consultations add column if not exists audio_processing_consent boolean not null default false;
alter table public.consultations add column if not exists research_reuse_consent boolean not null default false;
alter table public.consultations add column if not exists retention_until timestamptz;
alter table public.consultations add column if not exists video_retention_until timestamptz;
alter table public.consultations add column if not exists ai_provenance jsonb not null default '{}'::jsonb;
update public.consultations set retention_until = created_at + interval '2190 days' where retention_until is null;
update public.consultations set video_retention_until = created_at + interval '30 days' where video_url is not null and video_retention_until is null;
create index if not exists consultations_retention_idx on public.consultations(retention_until);
create index if not exists consultations_video_retention_idx on public.consultations(video_retention_until) where video_url is not null;
create index if not exists consultations_patient_token_hash_idx on public.consultations(patient_token_hash) where patient_token_hash is not null;

-- Existing plaintext capabilities cannot be made safe by hashing unknown client
-- state. Removing the column invalidates them. IF EXISTS keeps this migration
-- safe when 0003 was never applied or the legacy column was already removed.
drop index if exists consultations_patient_token_idx;
alter table public.consultations drop column if exists patient_token;

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  notice_version text not null,
  language_code text not null,
  audio_processing boolean not null,
  continuous_video boolean not null,
  research_reuse boolean not null default false,
  captured_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  retention_until timestamptz not null
);
alter table public.consent_records enable row level security;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_type text not null check (actor_type in ('patient', 'clinician', 'admin', 'system')),
  actor_id uuid,
  consultation_id uuid references public.consultations(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  outcome text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null
);
create index if not exists audit_events_consultation_idx on public.audit_events(consultation_id, created_at);
create index if not exists audit_events_retention_idx on public.audit_events(retention_until);
alter table public.audit_events enable row level security;

create table if not exists public.ai_processing_events (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid references public.consultations(id) on delete set null,
  actor_id uuid,
  purpose text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  language_code text not null,
  input_hash text not null,
  valid boolean,
  error_code text,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null
);
create index if not exists ai_processing_events_consultation_idx on public.ai_processing_events(consultation_id, created_at);
create index if not exists ai_processing_events_retention_idx on public.ai_processing_events(retention_until);
alter table public.ai_processing_events enable row level security;

create or replace function public.protect_append_only_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'audit records are append-only';
  end if;
  if old.retention_until > now() then
    raise exception 'audit record retention period has not elapsed';
  end if;
  return old;
end;
$$;
drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only before update or delete on public.audit_events
for each row execute function public.protect_append_only_audit();
drop trigger if exists ai_processing_events_append_only on public.ai_processing_events;
create trigger ai_processing_events_append_only before update or delete on public.ai_processing_events
for each row execute function public.protect_append_only_audit();

alter table public.prescriptions add column if not exists parse_provider text;
alter table public.prescriptions add column if not exists parse_model text;
alter table public.prescriptions add column if not exists prompt_version text;

alter table public.voice_calls add column if not exists retention_until timestamptz default (now() + interval '365 days');
update public.voice_calls set retention_until = created_at + interval '365 days' where retention_until is null;
create index if not exists voice_calls_retention_idx on public.voice_calls(retention_until);

-- Benchmark rows are now reserved for deliberately imported evaluation data.
-- Live clinical requests no longer write this table.
alter table public.benchmark_samples add column if not exists dataset_source text;
alter table public.benchmark_samples add column if not exists source_consent_confirmed boolean not null default false;
alter table public.benchmark_samples add column if not exists reference_provenance text;
alter table public.benchmark_samples add column if not exists run_id text;
alter table public.benchmark_samples add column if not exists model text;
alter table public.benchmark_samples add column if not exists retention_until timestamptz;
update public.benchmark_samples set retention_until = created_at + interval '365 days' where retention_until is null;

-- Prevent accidental mutation of audit evidence through browser roles. As with
-- the clinical tables, only the service-role backend has access; no public RLS
-- policies are created.
