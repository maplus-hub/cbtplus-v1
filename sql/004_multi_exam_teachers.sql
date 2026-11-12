-- CBTPlus v1.3: configuration for reusable exam periods and managed staff accounts.
-- Run only after 001, 002, and 003 migrations.

create table if not exists public.app_settings (
 id integer primary key default 1 check (id=1),
 school_name text not null default 'MA Plus Sunan Giri Salatiga',
 exam_app_name text not null default 'CBTPlus',
 default_duration_minutes integer not null default 90 check(default_duration_minutes between 10 and 300),
 updated_at timestamptz not null default now()
);
insert into public.app_settings(id) values (1) on conflict(id) do nothing;
alter table public.app_settings enable row level security;
drop policy if exists app_settings_staff_read on public.app_settings;
create policy app_settings_staff_read on public.app_settings for select to authenticated using (public.is_staff());
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin-only list of staff accounts. auth.users never exposed to client.
create index if not exists profiles_role_idx on public.profiles(role);

-- Setting active period is atomic; retain old data, assignments, schedules and scores.
create or replace function public.activate_exam_period(p_period uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Hanya admin'; end if;
 perform pg_advisory_xact_lock(987654321);
 if not exists (select 1 from public.exam_periods where id=p_period) then
   raise exception 'Periode tidak ditemukan';
 end if;
 update public.exam_periods set is_active=false where is_active=true;
 update public.exam_periods set is_active=true where id=p_period;
end;$$;
revoke all on function public.activate_exam_period(uuid) from public, anon;
grant execute on function public.activate_exam_period(uuid) to authenticated;

-- Prevent clients from self-upgrading their own profiles through profile writes.
-- Existing policy from 001 should already allow only administrator updates.
