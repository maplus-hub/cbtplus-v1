-- CBTPlus v1.8.1. Run after 001..010 in Supabase SQL Editor.
-- Student APK/EXE integration comes later. Token center API uses a service_role-only Edge Function.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cbt_supervisor_credentials (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.exam_periods(id) on delete cascade,
  room_id uuid not null references public.exam_rooms(id) on delete cascade,
  token_tag text not null unique,
  token_hash text not null,
  label text not null default '',
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(period_id,room_id)
);
create table if not exists public.cbt_supervisor_sessions (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.cbt_supervisor_credentials(id) on delete cascade,
  session_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table if not exists public.cbt_lesson_token_vault (
  schedule_id uuid primary key references public.exam_schedules(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.cbt_room_override_tokens (
  period_id uuid not null references public.exam_periods(id) on delete cascade,
  room_id uuid not null references public.exam_rooms(id) on delete cascade,
  token_hash text not null,
  ciphertext text not null,
  rotated_at timestamptz not null default now(),
  primary key(period_id,room_id)
);
create table if not exists public.cbt_supervisor_audit (
  id bigint generated always as identity primary key,
  period_id uuid references public.exam_periods(id),
  room_id uuid references public.exam_rooms(id),
  attempt_id uuid references public.exam_attempts(id),
  action text not null,
  actor text not null,
  happened_at timestamptz not null default now()
);
-- Strong defense in depth: no browser client can read these tables directly.
do $$ declare t text; begin
  foreach t in array array['cbt_supervisor_credentials','cbt_supervisor_sessions','cbt_lesson_token_vault','cbt_room_override_tokens','cbt_supervisor_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from PUBLIC, anon, authenticated', t);
  end loop;
end $$;

-- Called by authenticated-admin-authorized Edge Function, never directly by web users.
create or replace function public.cbt_v181_issue_supervisor(
  p_period uuid,p_room uuid,p_tag text,p_token text,p_label text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(p_token)<22 or length(p_tag)<6 then raise exception 'Token pengawas terlalu pendek'; end if;
  if not exists(select 1 from public.exam_periods where id=p_period) or
     not exists(select 1 from public.exam_rooms where id=p_room) then
    raise exception 'Periode / ruang tidak ditemukan';
  end if;
  -- A new login token invalidates all prior sessions for this room.
  update public.cbt_supervisor_credentials set revoked_at=clock_timestamp()
    where period_id=p_period and room_id=p_room;
  delete from public.cbt_supervisor_credentials where period_id=p_period and room_id=p_room;
  insert into public.cbt_supervisor_credentials(period_id,room_id,token_tag,token_hash,label)
    values(p_period,p_room,p_tag,extensions.crypt(p_token,extensions.gen_salt('bf',10)),left(coalesce(p_label,''),120));
  insert into public.cbt_supervisor_audit(period_id,room_id,action,actor)
    values(p_period,p_room,'issue_supervisor','admin');
end $$;

create or replace function public.cbt_v181_issue_lesson(
  p_schedule uuid,p_token text,p_cipher text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_period uuid;
begin
  select period_id into v_period from public.exam_schedules where id=p_schedule and status='published';
  if not found then raise exception 'Jadwal harus berstatus published'; end if;
  if length(p_token)<6 or length(p_cipher)<30 then raise exception 'Token pelajaran tidak valid'; end if;
  insert into public.exam_schedule_tokens(schedule_id,token_hash,changed_at)
    values(p_schedule,extensions.crypt(p_token,extensions.gen_salt('bf',10)),now())
    on conflict(schedule_id) do update set token_hash=excluded.token_hash,changed_at=now();
  insert into public.cbt_lesson_token_vault(schedule_id,ciphertext,updated_at)
    values(p_schedule,p_cipher,now())
    on conflict(schedule_id) do update set ciphertext=excluded.ciphertext,updated_at=now();
  insert into public.cbt_supervisor_audit(period_id,action,actor)
    values(v_period,'issue_lesson:'||p_schedule::text,'admin');
end $$;

create or replace function public.cbt_v181_login_supervisor(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; v_session text;v_exp timestamptz;
begin
  select * into c from public.cbt_supervisor_credentials
    where token_tag=split_part(coalesce(p_token,''),'-',1) and revoked_at is null for update;
  if not found or c.token_hash <> extensions.crypt(coalesce(p_token,''),c.token_hash) then
    raise exception 'Token pengawas tidak valid';
  end if;
  v_session:=encode(extensions.gen_random_bytes(32),'hex');
  v_exp:=clock_timestamp()+interval '12 hours';
  insert into public.cbt_supervisor_sessions(credential_id,session_hash,expires_at)
    values(c.id,encode(extensions.digest(v_session,'sha256'),'hex'),v_exp);
  insert into public.cbt_supervisor_audit(period_id,room_id,action,actor)
    values(c.period_id,c.room_id,'supervisor_login','supervisor');
  return jsonb_build_object('session_token',v_session,'period_id',c.period_id,'room_id',c.room_id,'expires_at',v_exp);
end $$;

create or replace function public.cbt_v181_verify_supervisor(p_session text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record;
begin
 select cr.period_id,cr.room_id,cr.label,s.expires_at
 into c from public.cbt_supervisor_sessions s
 join public.cbt_supervisor_credentials cr on cr.id=s.credential_id
 where s.session_hash=encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex')
   and s.revoked_at is null and s.expires_at>clock_timestamp() and cr.revoked_at is null;
 if not found then raise exception 'Sesi pengawas tidak valid atau sudah berakhir';end if;
 return jsonb_build_object('period_id',c.period_id,'room_id',c.room_id,'label',c.label,'expires_at',c.expires_at);
end $$;

create or replace function public.cbt_v181_rotate_override(p_session text,p_token text,p_cipher text)
returns void language plpgsql security definer set search_path = '' as $$
declare a jsonb;v_p uuid;v_r uuid;
begin
 a:=public.cbt_v181_verify_supervisor(p_session);
 v_p:=(a->>'period_id')::uuid;v_r:=(a->>'room_id')::uuid;
 if length(p_token)<12 or length(p_cipher)<30 then raise exception 'Token keluar terlalu pendek';end if;
 insert into public.cbt_room_override_tokens(period_id,room_id,token_hash,ciphertext)
 values(v_p,v_r,extensions.crypt(p_token,extensions.gen_salt('bf',10)),p_cipher)
 on conflict(period_id,room_id) do update set token_hash=excluded.token_hash,ciphertext=excluded.ciphertext,rotated_at=now();
 insert into public.cbt_supervisor_audit(period_id,room_id,action,actor)
 values(v_p,v_r,'rotate_override','supervisor');
end $$;

create or replace function public.cbt_v181_supervisor_lock(p_session text,p_attempt uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a jsonb; v_period uuid; v_room uuid; v_status text;
begin
 a:=public.cbt_v181_verify_supervisor(p_session);
 v_period:=(a->>'period_id')::uuid;v_room:=(a->>'room_id')::uuid;
 select at.status into v_status from public.exam_attempts at
 join public.exam_schedules sch on sch.id=at.schedule_id
 join public.room_assignments ra on ra.period_id=sch.period_id and ra.student_id=at.student_id
 where at.id=p_attempt and sch.period_id=v_period and ra.room_id=v_room for update of at;
 if not found or v_status<>'mengerjakan' then raise exception 'Hanya pengerjaan aktif di ruang ini yang dapat dikunci';end if;
 update public.exam_attempts set status='terkunci' where id=p_attempt;
 insert into public.cbt_supervisor_audit(period_id,room_id,attempt_id,action,actor)
 values(v_period,v_room,p_attempt,'lock','supervisor');
end $$;

-- Must be called by trusted server only. An override token does not bypass submit.
create or replace function public.cbt_v181_student_override(
 p_attempt uuid,p_nis text,p_token text,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record;tok text;
begin
 if p_action not in ('unlock','exit') then raise exception 'Aksi tidak diizinkan';end if;
 select at.id,at.status,sch.period_id,ra.room_id,sch.ends_at into a
 from public.exam_attempts at
 join public.students st on st.id=at.student_id
 join public.exam_schedules sch on sch.id=at.schedule_id
 join public.room_assignments ra on ra.period_id=sch.period_id and ra.student_id=at.student_id
 where at.id=p_attempt and st.nis=p_nis for update of at;
 if not found then raise exception 'Peserta atau sesi tidak sesuai';end if;
 select token_hash into tok from public.cbt_room_override_tokens
 where period_id=a.period_id and room_id=a.room_id;
 if tok is null or tok<>extensions.crypt(coalesce(p_token,''),tok) then
   raise exception 'Token pengawas tidak valid';end if;
 if p_action='unlock' then
   if a.status<>'terkunci' then raise exception 'Pengerjaan tidak terkunci';end if;
   if clock_timestamp()>=a.ends_at then raise exception 'Batas waktu ujian sudah habis';end if;
   update public.exam_attempts set status='mengerjakan' where id=p_attempt;
 elsif a.status<>'selesai' then raise exception 'Ujian wajib dikumpulkan sebelum keluar';
 end if;
 insert into public.cbt_supervisor_audit(period_id,room_id,attempt_id,action,actor)
 values(a.period_id,a.room_id,p_attempt,p_action,'student_override');
 return jsonb_build_object('allowed',true,'action',p_action);
end $$;

-- RPC privileged from Edge Function only; no anon/authenticated execute privileges.
do $$ declare sig text;begin
 foreach sig in array array[
 'cbt_v181_issue_supervisor(uuid,uuid,text,text,text)',
 'cbt_v181_issue_lesson(uuid,text,text)',
 'cbt_v181_login_supervisor(text)',
 'cbt_v181_verify_supervisor(text)',
 'cbt_v181_rotate_override(text,text,text)',
 'cbt_v181_supervisor_lock(text,uuid)',
 'cbt_v181_student_override(uuid,text,text,text)'] loop
 execute 'revoke all on function public.'||sig||' from PUBLIC, anon, authenticated';
 execute 'grant execute on function public.'||sig||' to service_role';
 end loop;
end $$;
