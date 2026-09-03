create extension if not exists pgcrypto;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  palm_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id),
  language_pair text,
  turns jsonb not null default '[]'::jsonb,
  structured_record jsonb not null default '{}'::jsonb,
  red_flag_status jsonb not null default '{"emergency":false,"triggers":[]}'::jsonb,
  video_url text,
  video_consent boolean not null default false,
  status text not null default 'pending' check (status in ('pending','reviewed','flagged','complete')),
  created_at timestamptz not null default now()
);

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id),
  doctor_id uuid not null references public.doctors(id),
  drug text not null,
  dosage text not null,
  instructions text,
  created_at timestamptz not null default now()
);

create index if not exists consultations_status_created_idx on public.consultations(status, created_at);
create index if not exists patients_phone_idx on public.patients(phone);

alter table public.patients enable row level security;
alter table public.consultations enable row level security;
alter table public.doctors enable row level security;
alter table public.prescriptions enable row level security;

-- Application data is accessed through the Express server using the service role.
-- The browser's anon/authenticated roles receive no direct table policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-videos', 'consultation-videos', false, 52428800, array['video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;
-- No public storage policy: uploads and signed URLs are issued only by the server.
