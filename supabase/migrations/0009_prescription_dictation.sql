-- Auditable clinician dictation. The browser cannot read either table directly;
-- all access remains behind approved-clinician server routes.
alter table public.prescriptions add column if not exists frequency text;
alter table public.prescriptions add column if not exists duration text;
alter table public.prescriptions add column if not exists dictated boolean not null default false;
alter table public.prescriptions add column if not exists raw_transcript text;
alter table public.prescriptions add column if not exists parse_confidence double precision;

alter table public.prescriptions drop constraint if exists prescriptions_parse_confidence_check;
alter table public.prescriptions add constraint prescriptions_parse_confidence_check
  check (parse_confidence is null or (parse_confidence >= 0 and parse_confidence <= 1));

create table if not exists public.benchmark_samples (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id),
  provider text not null default 'sahara',
  language_code text not null,
  speech_file_id text,
  raw_transcript text not null,
  parsed_output jsonb,
  valid boolean,
  validation_errors jsonb,
  created_at timestamptz not null default now()
);

create index if not exists benchmark_samples_created_idx on public.benchmark_samples(created_at);
alter table public.benchmark_samples enable row level security;
