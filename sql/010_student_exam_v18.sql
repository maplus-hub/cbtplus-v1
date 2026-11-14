-- CBTPlus v1.8 • Portal ujian siswa (pilot / web)
-- Prasyarat: migrations 001..008 dan SQL 007 hotfix telah terpasang.
-- Siswa login dengan Supabase Auth, lalu user_id dipetakan ke students.id.
-- Tidak ada kunci jawaban yang diakses melalui RPC siswa.

create table if not exists public.student_auth_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id uuid not null unique references public.students(id) on delete restrict,
  linked_at timestamptz not null default now()
);
alter table public.student_auth_links enable row level security;
revoke all on public.student_auth_links from anon, authenticated;

create or replace function public.cbt_v18_student_id()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Login siswa diperlukan'; end if;
 select l.student_id into v_id
 from public.student_auth_links l
 join public.students s on s.id=l.student_id and s.status='Aktif'
 join public.profiles p on p.id=l.user_id and p.role='siswa'
 where l.user_id=auth.uid();
 if v_id is null then raise exception 'Akun belum terhubung ke siswa aktif'; end if;
 return v_id;
end $$;
revoke all on function public.cbt_v18_student_id() from public,anon,authenticated;

-- Hanya admin sekolah boleh memetakan akun Auth siswa yang SUDAH ADA.
create or replace function public.cbt_v18_link_student(p_student uuid,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Hanya admin';end if;
 if not exists(select 1 from public.students where id=p_student) then raise exception 'Siswa tidak ditemukan';end if;
 if not exists(select 1 from public.profiles where id=p_user and role='siswa') then
   raise exception 'Pengguna harus mempunyai profil siswa';end if;
 if exists(select 1 from public.student_auth_links where student_id=p_student and user_id<>p_user) then
   raise exception 'Siswa sudah terhubung ke akun lain';end if;
 insert into public.student_auth_links(user_id,student_id) values(p_user,p_student)
 on conflict(user_id) do update set student_id=excluded.student_id;
end $$;
revoke all on function public.cbt_v18_link_student(uuid,uuid) from public,anon;
grant execute on function public.cbt_v18_link_student(uuid,uuid) to authenticated;

-- Daftar jadwal: tidak mengungkap token atau jawaban.
create or replace function public.cbt_v18_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_student uuid;v_data jsonb;
begin
 v_student:=public.cbt_v18_student_id();
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'subject',su.name,'class',cl.code,'starts_at',e.starts_at,
   'ends_at',e.ends_at,'status',coalesce(a.status,'belum_mulai'),
   'instructions',e.instructions) order by e.starts_at), '[]'::jsonb)
 into v_data
 from public.exam_schedules e
 join public.students st on st.id=v_student and st.class_id=e.class_id
 join public.classes cl on cl.id=st.class_id
 join public.subjects su on su.id=e.subject_id
 join public.room_assignments ra on ra.student_id=st.id and ra.period_id=e.period_id
 left join public.exam_attempts a on a.schedule_id=e.id and a.student_id=v_student
 where e.status='published' and e.bank_id is not null
   and (e.ends_at>clock_timestamp() or a.id is not null);
 return v_data;
end $$;
revoke all on function public.cbt_v18_catalog() from public,anon;
grant execute on function public.cbt_v18_catalog() to authenticated;

-- Mulai / lanjut mengerjakan. Token harus valid saat membuka sesi.
create or replace function public.cbt_v18_start(p_schedule uuid,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_student uuid;v_schedule record;v_attempt record;v_questions jsonb;
begin
 v_student:=public.cbt_v18_student_id();
 select e.* into v_schedule
 from public.exam_schedules e
 join public.students st on st.class_id=e.class_id and st.id=v_student
 join public.room_assignments ra on ra.period_id=e.period_id and ra.student_id=st.id
 where e.id=p_schedule and e.status='published' and e.bank_id is not null;
 if not found then raise exception 'Jadwal tidak tersedia untuk peserta';end if;
 if clock_timestamp()<v_schedule.starts_at then raise exception 'Ujian belum dimulai';end if;
 if clock_timestamp()>=v_schedule.ends_at and not exists (
   select 1 from public.exam_attempts a where a.schedule_id=p_schedule
   and a.student_id=v_student and a.status='mengerjakan'
 ) then raise exception 'Waktu ujian sudah berakhir';end if;
 if not public.internal_check_exam_token(p_schedule,coalesce(p_token,'')) then
   raise exception 'Token ujian salah';end if;
 if clock_timestamp()<v_schedule.ends_at then
   insert into public.exam_attempts(schedule_id,student_id,status,started_at)
   values(p_schedule,v_student,'mengerjakan',clock_timestamp())
   on conflict(schedule_id,student_id) do nothing;
 end if;
 select * into v_attempt from public.exam_attempts
 where schedule_id=p_schedule and student_id=v_student for update;
 if v_attempt.status<>'mengerjakan' then raise exception 'Ujian sudah dikumpulkan atau dikunci';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',q.id,'kind',q.kind,'position',q.position,'prompt',q.prompt,
   'options',q.options,'answer',sa.answer) order by q.position,q.id),'[]'::jsonb)
 into v_questions
 from public.questions q
 left join public.student_answers sa on sa.question_id=q.id and sa.attempt_id=v_attempt.id
 where q.bank_id=v_schedule.bank_id;
 return jsonb_build_object('attempt_id',v_attempt.id,'ends_at',v_schedule.ends_at,
    'started_at',v_attempt.started_at,'status',v_attempt.status,'questions',v_questions);
end $$;
revoke all on function public.cbt_v18_start(uuid,text) from public,anon;
grant execute on function public.cbt_v18_start(uuid,text) to authenticated;

-- Autosave tervalidasi di server, tidak menerima bank soal lain atau setelah deadline.
create or replace function public.cbt_v18_save(p_attempt uuid,p_question uuid,p_answer jsonb)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_student uuid;v_attempt record;v_q record;v_now timestamptz;v_n integer;
begin
 v_student:=public.cbt_v18_student_id();
 select a.*,e.ends_at,e.status as schedule_status,e.bank_id
 into v_attempt
 from public.exam_attempts a join public.exam_schedules e on e.id=a.schedule_id
 where a.id=p_attempt and a.student_id=v_student for update of a;
 if not found or v_attempt.status<>'mengerjakan' or v_attempt.schedule_status<>'published' then
   raise exception 'Sesi pengerjaan tidak aktif';end if;
 v_now:=clock_timestamp();
 if v_now>=v_attempt.ends_at then raise exception 'Waktu ujian habis, kirim jawaban yang sudah tersimpan';end if;
 select id,kind,options into v_q from public.questions
 where id=p_question and bank_id=v_attempt.bank_id;
 if not found then raise exception 'Soal tidak termasuk ujian ini';end if;
 if jsonb_typeof(p_answer)<>'object' then raise exception 'Format jawaban tidak valid';end if;
 if v_q.kind='pg' then
   if jsonb_typeof(p_answer->'correct')<>'string' or
      (p_answer->>'correct') !~ '^[A-E]$' or
      ascii(p_answer->>'correct')>=65+jsonb_array_length(v_q.options) then
      raise exception 'Jawaban PG tidak valid';end if;
 elsif v_q.kind='mcma' then
   if jsonb_typeof(p_answer->'selected')<>'array' then raise exception 'Jawaban MCMA tidak valid';end if;
   if exists(select 1 from jsonb_array_elements(p_answer->'selected') x(v)
      where jsonb_typeof(x.v)<>'string' or (x.v #>> '{}') !~ '^[A-E]$'
         or ascii(x.v #>> '{}')>=65+jsonb_array_length(v_q.options))
      or (select count(*) from jsonb_array_elements_text(p_answer->'selected'))<>
         (select count(distinct x.v) from jsonb_array_elements_text(p_answer->'selected') x(v)) then
      raise exception 'Pilihan MCMA tidak valid/duplikat';end if;
 elsif v_q.kind='kategori' then
   if jsonb_typeof(p_answer->'answers')<>'array' or
     jsonb_array_length(p_answer->'answers')<>jsonb_array_length(v_q.options) or
     exists(select 1 from jsonb_array_elements(p_answer->'answers') x(v)
            where jsonb_typeof(x.v) not in ('boolean','null')) then
     raise exception 'Jawaban kategori harus sesuai jumlah pernyataan';end if;
 elsif v_q.kind='esai' then
   if jsonb_typeof(p_answer->'text')<>'string' or length(p_answer->>'text')>20000 then
     raise exception 'Jawaban esai tidak valid atau terlalu panjang';end if;
 end if;
 insert into public.student_answers(attempt_id,question_id,answer,updated_at)
 values(p_attempt,p_question,p_answer,v_now)
 on conflict(attempt_id,question_id) do update
 set answer=excluded.answer,updated_at=excluded.updated_at;
 return v_now;
end $$;
revoke all on function public.cbt_v18_save(uuid,uuid,jsonb) from public,anon;
grant execute on function public.cbt_v18_save(uuid,uuid,jsonb) to authenticated;

-- Finalisasi hanya untuk pemilik pengerjaan; nilai dihitung server-side v1.7.
-- Boleh mengumpulkan setelah deadline, tetapi jawaban tidak boleh disunting lagi.
create or replace function public.cbt_v18_submit(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_student uuid;v_a record;v_now timestamptz;
begin
 v_student:=public.cbt_v18_student_id();
 select a.id,a.status into v_a from public.exam_attempts a
 where a.id=p_attempt and a.student_id=v_student for update;
 if not found then raise exception 'Pengerjaan tidak ditemukan';end if;
 if v_a.status='selesai' then return jsonb_build_object('status','selesai','attempt_id',p_attempt);end if;
 if v_a.status<>'mengerjakan' then raise exception 'Pengerjaan terkunci';end if;
 v_now:=clock_timestamp();
 update public.exam_attempts set status='selesai',submitted_at=v_now where id=p_attempt;
 perform public.cbt_v17_recalc_internal(p_attempt);
 return jsonb_build_object('status','selesai','attempt_id',p_attempt,'submitted_at',v_now);
end $$;
revoke all on function public.cbt_v18_submit(uuid) from public,anon;
grant execute on function public.cbt_v18_submit(uuid) to authenticated;

-- Perizinan RPC langsung siswa tidak memberikan akses langsung tabel kunci.
-- Periksa juga konfigurasi RLS sebelum ujian resmi.
