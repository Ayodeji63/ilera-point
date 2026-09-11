-- Task shifting: Nigeria's TSTS policy already defines what community health
-- cadres may deliver. These columns let the queue route to them automatically.
alter table public.doctors drop constraint if exists doctors_role_check;
alter table public.doctors add constraint doctors_role_check
  check (role in ('chew', 'cho', 'nurse', 'doctor', 'admin'));

-- Which queue a completed interview belongs in, decided deterministically by
-- server/careRouting.js at save time, plus the reasons so a clinician can see
-- what the decision was based on instead of having to trust it.
alter table public.consultations add column if not exists assigned_tier text not null default 'doctor';
alter table public.consultations drop constraint if exists consultations_assigned_tier_check;
alter table public.consultations add constraint consultations_assigned_tier_check
  check (assigned_tier in ('chew', 'doctor'));
alter table public.consultations add column if not exists routing_reasons jsonb not null default '[]'::jsonb;
alter table public.consultations add column if not exists escalated_by uuid references public.doctors(id);
alter table public.consultations add column if not exists escalated_at timestamptz;

create index if not exists consultations_tier_status_idx on public.consultations(assigned_tier, status, created_at);

-- Existing rows default to 'doctor', the safe direction: nothing already in the
-- queue silently moves down to a community health worker because of this change.
