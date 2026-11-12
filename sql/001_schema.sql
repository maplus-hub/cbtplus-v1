-- CBTPlus v1.0 | Run in Supabase SQL Editor, ONCE, for a fresh project.
-- NEVER put service_role credentials in web or mobile clients.
create extension if not exists pgcrypto;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 role text not null check(role in ('admin','guru','pengawas','siswa')) default 'siswa',
 created_at timestamptz not null default now()
);
create table public.exam_periods (
 id uuid primary key default gen_random_uuid(),
 title text not null, academic_year text not null,
 start_date date, end_date date,
 is_active boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index one_active_period on public.exam_periods(is_active) where is_active;
create table public.classes (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 level smallint not null check(level in (10,11,12))
);
create table public.students (
 id uuid primary key default gen_random_uuid(),
 nis text not null unique,
 nisn text unique,
 full_name text not null check(length(trim(full_name))>0),
 class_id uuid not null references public.classes(id),
 gender text not null check(gender in ('L','P')),
 birth_date date,
 status text not null default 'Aktif' check(status in ('Aktif','Nonaktif')),
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.exam_rooms (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 location text not null,
 capacity integer not null check(capacity > 0),
 sort_order integer not null default 0
);
create table public.room_assignments (
 id uuid primary key default gen_random_uuid(),
 period_id uuid not null references public.exam_periods(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 room_id uuid not null references public.exam_rooms(id),
 seat_number integer not null check(seat_number > 0),
 assigned_at timestamptz not null default now(),
 assigned_by uuid references auth.users(id),
 unique(period_id,student_id),
 unique(period_id,room_id,seat_number)
);
create table public.room_assignment_logs (
 id bigint generated always as identity primary key,
 period_id uuid not null references public.exam_periods(id),
 student_id uuid not null references public.students(id),
 old_room_id uuid references public.exam_rooms(id),
 new_room_id uuid references public.exam_rooms(id),
 old_seat integer, new_seat integer,
 changed_by uuid references auth.users(id),
 changed_at timestamptz not null default now()
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(),
 name text not null unique
);
create table public.question_banks (
 id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references public.subjects(id),
 class_id uuid references public.classes(id),
 title text not null,
 owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.questions (
 id uuid primary key default gen_random_uuid(),
 bank_id uuid not null references public.question_banks(id) on delete cascade,
 kind text not null check(kind in ('pg','mcma','kategori','esai')),
 prompt text not null,
 points numeric(8,2) not null default 1 check(points >= 0),
 position integer not null default 0
);
-- Answer keys must NOT be readable by student clients.
create table public.question_keys (
 question_id uuid primary key references public.questions(id) on delete cascade,
 answer jsonb not null,
 explanation text
);
create table public.exam_schedules (
 id uuid primary key default gen_random_uuid(),
 period_id uuid not null references public.exam_periods(id),
 subject_id uuid not null references public.subjects(id),
 class_id uuid references public.classes(id),
 bank_id uuid references public.question_banks(id),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 check(ends_at > starts_at)
);
create table public.supervisor_assignments (
 id uuid primary key default gen_random_uuid(),
 schedule_id uuid not null references public.exam_schedules(id) on delete cascade,
 room_id uuid not null references public.exam_rooms(id),
 supervisor_id uuid not null references auth.users(id),
 unique(schedule_id,room_id,supervisor_id)
);
create table public.exam_attempts (
 id uuid primary key default gen_random_uuid(),
 schedule_id uuid not null references public.exam_schedules(id),
 student_id uuid not null references public.students(id),
 status text not null default 'belum_mulai' check(status in ('belum_mulai','mengerjakan','terkunci','selesai')),
 started_at timestamptz,submitted_at timestamptz,
 unique(schedule_id,student_id)
);
create table public.student_answers (
 attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
 question_id uuid not null references public.questions(id),
 answer jsonb not null,updated_at timestamptz not null default now(),
 primary key(attempt_id,question_id)
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','guru'));
$$;
revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

alter table public.profiles enable row level security;
create policy profiles_view on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());

alter table public.classes enable row level security;
create policy classes_staff_select on public.classes for select to authenticated using(public.is_staff());
create policy classes_admin_write on public.classes for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.students enable row level security;
create policy students_staff_select on public.students for select to authenticated using(public.is_staff());
create policy students_admin_write on public.students for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.exam_periods enable row level security;
create policy periods_staff_select on public.exam_periods for select to authenticated using(public.is_staff());
create policy periods_admin_write on public.exam_periods for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.exam_rooms enable row level security;
create policy rooms_staff_select on public.exam_rooms for select to authenticated using(public.is_staff());
create policy rooms_admin_write on public.exam_rooms for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.room_assignments enable row level security;
create policy assignments_staff_select on public.room_assignments for select to authenticated using(public.is_staff());
-- Assignments can only be modified through validated server function below.
alter table public.room_assignment_logs enable row level security;
create policy assignment_logs_admin_read on public.room_assignment_logs for select to authenticated using(public.is_admin());

alter table public.subjects enable row level security;
create policy subjects_staff_read on public.subjects for select to authenticated using(public.is_staff());
create policy subjects_admin_write on public.subjects for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.question_banks enable row level security;
create policy banks_staff_read on public.question_banks for select to authenticated using(public.is_staff());
create policy banks_staff_insert on public.question_banks for insert to authenticated with check(public.is_staff() and (owner_id=auth.uid() or public.is_admin()));
create policy banks_staff_update on public.question_banks for update to authenticated using(public.is_admin() or (public.is_staff() and owner_id=auth.uid())) with check(public.is_admin() or (public.is_staff() and owner_id=auth.uid()));
alter table public.questions enable row level security;
create policy questions_staff_read on public.questions for select to authenticated using(public.is_staff());
create policy questions_staff_write on public.questions for all to authenticated using(public.is_admin() or exists(select 1 from public.question_banks b where b.id=bank_id and b.owner_id=auth.uid())) with check(public.is_admin() or exists(select 1 from public.question_banks b where b.id=bank_id and b.owner_id=auth.uid()));
alter table public.question_keys enable row level security;
create policy keys_staff_read on public.question_keys for select to authenticated using(public.is_staff());
create policy keys_staff_write on public.question_keys for all to authenticated using(public.is_admin() or exists(select 1 from public.questions q join public.question_banks b on q.bank_id=b.id where q.id=question_id and b.owner_id=auth.uid())) with check(public.is_admin() or exists(select 1 from public.questions q join public.question_banks b on q.bank_id=b.id where q.id=question_id and b.owner_id=auth.uid()));
alter table public.exam_schedules enable row level security;
create policy schedule_staff_read on public.exam_schedules for select to authenticated using(public.is_staff());
create policy schedule_admin_write on public.exam_schedules for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.supervisor_assignments enable row level security;
create policy supervisor_staff_read on public.supervisor_assignments for select to authenticated using(public.is_staff());
create policy supervisor_admin_write on public.supervisor_assignments for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.exam_attempts enable row level security;
create policy attempts_staff_read on public.exam_attempts for select to authenticated using(public.is_staff());
alter table public.student_answers enable row level security;
create policy answers_staff_read on public.student_answers for select to authenticated using(public.is_staff());

-- Prevent accidental room overflow even under concurrent writes.
create or replace function public.validate_room_capacity() returns trigger
language plpgsql set search_path = '' as $$
declare cap integer; used_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.period_id::text || new.room_id::text,0));
 select capacity into cap from public.exam_rooms where id=new.room_id;
 select count(*) into used_count from public.room_assignments
  where period_id=new.period_id and room_id=new.room_id and id is distinct from new.id;
 if used_count>=cap then raise exception 'Kapasitas ruang sudah penuh';end if;
 if new.seat_number>cap then raise exception 'Nomor kursi melebihi kapasitas';end if;
 return new;
end;$$;
create trigger room_capacity_guard before insert or update on public.room_assignments
for each row execute function public.validate_room_capacity();

-- Single-student manual placement (no general table writes from browser).
create or replace function public.assign_student_room(p_period uuid,p_student uuid,p_room uuid,p_seat integer)
returns void language plpgsql security definer set search_path = '' as $$
declare old_row public.room_assignments%rowtype;
begin
 if not public.is_admin() then raise exception 'Hanya admin';end if;
 select * into old_row from public.room_assignments where period_id=p_period and student_id=p_student for update;
 insert into public.room_assignments(period_id,student_id,room_id,seat_number,assigned_by)
 values(p_period,p_student,p_room,p_seat,auth.uid())
 on conflict(period_id,student_id) do update set room_id=excluded.room_id,seat_number=excluded.seat_number,assigned_at=now(),assigned_by=auth.uid();
 insert into public.room_assignment_logs(period_id,student_id,old_room_id,new_room_id,old_seat,new_seat,changed_by)
 values(p_period,p_student,old_row.room_id,p_room,old_row.seat_number,p_seat,auth.uid());
end;$$;
revoke all on function public.assign_student_room(uuid,uuid,uuid,integer) from public;
grant execute on function public.assign_student_room(uuid,uuid,uuid,integer) to authenticated;

insert into public.classes(code,level) values
 ('X.1',10),('X.2',10),('XI.1',11),('XI.2',11),('XII.1',12),('XII.2',12)
on conflict(code) do nothing;
insert into public.exam_rooms(name,location,capacity,sort_order) values
 ('Ruang 01','Kelas X.2',17,1),('Ruang 02','Kelas XII.2',23,2),('Ruang 03','Kelas XI.2',23,3),('Ruang 04','Kelas X.1',17,4),
 ('Ruang 05','Serba Guna',23,5),('Ruang 06','Kelas XI.1',20,6),('Ruang 07','Kelas XII.1',20,7),('Ruang 08','Masjid',24,8)
on conflict(name) do nothing;
insert into public.exam_periods(title,academic_year,start_date,end_date,is_active)
values ('ASAS Gasal','2026/2027','2026-11-27','2026-12-11',true);
insert into public.subjects(name) values
 ('Al-Qur’an Hadist'),('Akidah Akhlak'),('Fiqih'),('SKI'),('Bahasa Arab'),('Pendidikan Pancasila'),
 ('Bahasa Indonesia'),('Matematika'),('Bahasa Inggris'),('Seni Teater'),('PJOK'),('Sejarah'),('Ekonomi'),('Sosiologi'),
 ('Usul Fiqih'),('Bahasa Inggris Tingkat Lanjut'),('Bahasa Arab Tingkat Lanjut'),('Geografi'),('Fisika'),('Biologi')
on conflict(name) do nothing;

-- Generate a balanced random distribution ONCE for a period. To replace a distribution,
-- admin must explicitly remove placements using a separately reviewed operation.
create or replace function public.generate_balanced_rooms(p_period uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; target_room uuid; target_seat int; assigned_count int:=0;
begin
 if not public.is_admin() then raise exception 'Hanya admin';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_period::text,0));
 if not exists(select 1 from public.exam_periods where id=p_period) then raise exception 'Periode tidak ditemukan';end if;
 if exists(select 1 from public.room_assignments where period_id=p_period) then
  raise exception 'Penempatan periode sudah ada. Ubah peserta satu per satu lewat menu manual.';
 end if;
 if (select count(*) from public.students where status='Aktif') > (select coalesce(sum(capacity),0) from public.exam_rooms) then
  raise exception 'Daya tampung ruang tidak mencukupi';
 end if;
 for s in
  select st.id as student_id,st.class_id from public.students st
  join public.classes c on c.id=st.class_id
  where st.status='Aktif' order by random()
 loop
  -- Prioritize fewer students from same class, then lower room load ratio.
  select r.id,
    (select coalesce(max(a.seat_number),0)+1 from public.room_assignments a where a.period_id=p_period and a.room_id=r.id)
  into target_room,target_seat
  from public.exam_rooms r
  where (select count(*) from public.room_assignments a where a.period_id=p_period and a.room_id=r.id) < r.capacity
  order by
   (select count(*) from public.room_assignments a join public.students st2 on st2.id=a.student_id where a.period_id=p_period and a.room_id=r.id and st2.class_id=s.class_id),
   (select count(*)::numeric / r.capacity from public.room_assignments a where a.period_id=p_period and a.room_id=r.id),
   random() limit 1;
  if target_room is null then raise exception 'Tidak ada ruang tersedia';end if;
  insert into public.room_assignments(period_id,student_id,room_id,seat_number,assigned_by)
  values(p_period,s.student_id,target_room,target_seat,auth.uid());
  insert into public.room_assignment_logs(period_id,student_id,new_room_id,new_seat,changed_by)
  values(p_period,s.student_id,target_room,target_seat,auth.uid());
  assigned_count:=assigned_count+1;
 end loop;
 return assigned_count;
end;$$;
revoke all on function public.generate_balanced_rooms(uuid) from public;
grant execute on function public.generate_balanced_rooms(uuid) to authenticated;
