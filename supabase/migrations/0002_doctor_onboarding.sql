-- Doctors self-register, but a new account sees no patient data until an
-- administrator approves it. `status` defaults to 'pending' so any row that
-- predates this migration loses access rather than silently keeping it.
alter table public.doctors
  add column if not exists status text not null default 'pending',
  add column if not exists role text not null default 'doctor',
  add column if not exists licence_number text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.doctors(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'doctors_status_check') then
    alter table public.doctors add constraint doctors_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'doctors_role_check') then
    alter table public.doctors add constraint doctors_role_check
      check (role in ('doctor', 'admin'));
  end if;
end $$;

create index if not exists doctors_status_idx on public.doctors(status);

-- Row level security stays on with no browser policies: applications are written
-- and reviewed only by the Express server holding the service role.
