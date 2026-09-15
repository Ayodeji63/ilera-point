-- Durable Africa's Talking call intents. Only the service-role backend uses
-- this table; callback callers never receive rows or patient information.
create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('escalation', 'followup')),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  audio_path text not null,
  to_number text not null,
  session_id text,
  status text not null default 'pending' check (status in (
    'pending', 'queued', 'not_placed', 'placement_failed',
    'retry_scheduled', 'retrying', 'ringing', 'answered', 'completed',
    'failed', 'busy', 'rejected', 'unreachable', 'no_answer',
    'failed_exhausted'
  )),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create unique index if not exists voice_calls_session_id_idx on public.voice_calls(session_id) where session_id is not null;
create index if not exists voice_calls_retry_idx on public.voice_calls(next_attempt_at) where status in ('retry_scheduled', 'retrying');

alter table public.voice_calls enable row level security;
