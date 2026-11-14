-- CBTPlus v1.7 • Penilaian otomatis dan koreksi esai
-- Jalankan setelah 001..007; dicadangkan dahulu. Bukan migrasi pendaftaran siswa.
-- Format jawaban siswa: PG {"correct":"B"}; MCMA {"selected":["A","C"]};
-- kategori {"answers":[true,false,true]}; esai {"text":"..."}.
-- Kebijakan MCMA: proporsional dengan penalti pilihan salah; kategori: per pernyataan.

create table if not exists public.exam_answer_grades (
  attempt_id uuid not null,
  question_id uuid not null,
  auto_points numeric(10,2) not null default 0 check(auto_points >= 0),
  manual_points numeric(10,2) check(manual_points >= 0),
  feedback text not null default '',
  graded_by uuid references auth.users(id),
  graded_at timestamptz,
  calculated_at timestamptz not null default now(),
  primary key(attempt_id,question_id),
  foreign key(attempt_id,question_id)
    references public.student_answers(attempt_id,question_id) on delete cascade
);

create table if not exists public.exam_grade_audit (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  old_points numeric(10,2),
  new_points numeric(10,2) not null,
  old_feedback text,
  new_feedback text,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
create index if not exists idx_exam_grade_audit_attempt on public.exam_grade_audit(attempt_id,changed_at desc);

alter table public.exam_answer_grades enable row level security;
alter table public.exam_grade_audit enable row level security;
-- No direct policies. Teachers/admin use validated RPCs; students cannot see grades/keys.
revoke all on public.exam_answer_grades from anon, authenticated;
revoke all on public.exam_grade_audit from anon, authenticated;

-- Internal pure scoring routine. Never grants access to the answer keys.
create or replace function public.cbt_v17_score_question(
  p_kind text, p_answer jsonb, p_key jsonb, p_options jsonb, p_max numeric
) returns numeric language plpgsql immutable set search_path='' as $$
declare
  v_correct int:=0; v_wrong int:=0; v_total_correct int:=0;
  v_distractors int:=0; v_matches int:=0; v_count int:=0;
  v_selected jsonb; v_true jsonb; v_fraction numeric:=0;
  v_index int;
begin
  if p_answer is null or coalesce(p_max,0)<=0 then return 0; end if;
  if p_kind='pg' then
    if jsonb_typeof(p_answer)='object' and p_answer->>'correct'=p_key->>'correct'
       and p_answer ? 'correct' then return round(p_max,2); end if;
    return 0;
  elsif p_kind='mcma' then
    v_selected:=p_answer->'selected'; v_true:=p_key->'correct';
    if jsonb_typeof(v_selected)<>'array' or jsonb_typeof(v_true)<>'array' then return 0;end if;
    -- Reject malformed/duplicate/unknown answer codes to avoid scoring manipulation.
    if exists (select 1 from jsonb_array_elements(v_selected) x(value)
               where jsonb_typeof(x.value)<>'string'
                 or length(trim(x.value #>> '{}'))<>1
                 or x.value #>> '{}' not in ('A','B','C','D','E')) then return 0; end if;
    if exists (select 1 from jsonb_array_elements_text(v_selected) s(value)
       where ascii(s.value)<65 or ascii(s.value)>=65+jsonb_array_length(p_options)) then return 0; end if;
    if (select count(*) from jsonb_array_elements_text(v_selected)) <>
       (select count(distinct value) from jsonb_array_elements_text(v_selected)) then return 0;end if;
    v_total_correct:=jsonb_array_length(v_true);
    v_distractors:=greatest(0,jsonb_array_length(p_options)-v_total_correct);
    if v_total_correct=0 then return 0;end if;
    select count(*) into v_correct from jsonb_array_elements_text(v_selected) s(value)
      where exists(select 1 from jsonb_array_elements_text(v_true) k(value) where k.value=s.value);
    select count(*) into v_wrong from jsonb_array_elements_text(v_selected) s(value)
      where not exists(select 1 from jsonb_array_elements_text(v_true) k(value) where k.value=s.value);
    v_fraction:=v_correct::numeric/v_total_correct;
    if v_distractors>0 then v_fraction:=v_fraction-v_wrong::numeric/v_distractors;
    elsif v_wrong>0 then return 0;
    end if;
    return round(p_max*greatest(0,least(1,v_fraction)),2);
  elsif p_kind='kategori' then
    v_selected:=p_answer->'answers';v_true:=p_key->'answers';
    if jsonb_typeof(v_selected)<>'array' or jsonb_typeof(v_true)<>'array' then return 0;end if;
    v_count:=jsonb_array_length(v_true);
    if v_count=0 or jsonb_array_length(v_selected)<>v_count then return 0;end if;
    select count(*) into v_matches
    from jsonb_array_elements(v_selected) with ordinality s(value,idx)
    join jsonb_array_elements(v_true) with ordinality k(value,idx) using(idx)
    where jsonb_typeof(s.value)='boolean' and s.value=k.value;
    return round(p_max*v_matches::numeric/v_count,2);
  end if;
  return 0; -- esai requires teacher grading
end; $$;
revoke all on function public.cbt_v17_score_question(text,jsonb,jsonb,jsonb,numeric) from public,anon,authenticated;

-- Internal recalculation: only answer rows belonging to this attempt's bank.
create or replace function public.cbt_v17_recalc_internal(p_attempt uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_bank uuid; v_q record; v_auto numeric;
begin
  select s.bank_id into v_bank
  from public.exam_attempts a join public.exam_schedules s on s.id=a.schedule_id
  where a.id=p_attempt for update of a;
  if v_bank is null then raise exception 'Pengerjaan atau bank soal tidak ditemukan';end if;
  for v_q in
    select q.id,q.kind,q.points,q.options,k.answer as answer_key,sa.answer as student_answer
    from public.student_answers sa
    join public.questions q on q.id=sa.question_id and q.bank_id=v_bank
    join public.question_keys k on k.question_id=q.id
    where sa.attempt_id=p_attempt
  loop
    v_auto:=public.cbt_v17_score_question(v_q.kind,v_q.student_answer,v_q.answer_key,v_q.options,v_q.points);
    insert into public.exam_answer_grades(attempt_id,question_id,auto_points,calculated_at)
    values(p_attempt,v_q.id,v_auto,now())
    on conflict(attempt_id,question_id) do update
      set auto_points=excluded.auto_points,calculated_at=now(),
          manual_points=case when v_q.kind='esai' then exam_answer_grades.manual_points else null end,
          feedback=case when v_q.kind='esai' then exam_answer_grades.feedback else '' end,
          graded_by=case when v_q.kind='esai' then exam_answer_grades.graded_by else null end,
          graded_at=case when v_q.kind='esai' then exam_answer_grades.graded_at else null end;
  end loop;
  delete from public.exam_answer_grades g where g.attempt_id=p_attempt
    and not exists(select 1 from public.student_answers sa
                   where sa.attempt_id=g.attempt_id and sa.question_id=g.question_id);
end;$$;
revoke all on function public.cbt_v17_recalc_internal(uuid) from public,anon,authenticated;

-- Validated access to ONE schedule's records.
create or replace function public.cbt_v17_can_grade_schedule(p_schedule uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.exam_schedules s
  join public.question_banks b on b.id=s.bank_id
  join public.profiles p on p.id=(select auth.uid())
  where s.id=p_schedule and p.role in ('admin','guru')
    and (p.role='admin' or b.owner_id=p.id)
 );
$$;
revoke all on function public.cbt_v17_can_grade_schedule(uuid) from public,anon,authenticated;

create or replace function public.cbt_v17_results(p_schedule uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_att record;v_result jsonb:='[]'::jsonb;v_bank uuid;v_max numeric;
        v_auto numeric;v_manual numeric;v_pending integer;v_answered integer;
begin
 if not public.cbt_v17_can_grade_schedule(p_schedule) then raise exception 'Tidak memiliki akses ke jadwal tersebut';end if;
 select bank_id into v_bank from public.exam_schedules where id=p_schedule;
 select coalesce(sum(points),0) into v_max from public.questions where bank_id=v_bank;
 for v_att in
   select a.id,a.student_id,a.status,a.submitted_at,st.nis,st.full_name,c.code as class_name
   from public.exam_attempts a join public.students st on st.id=a.student_id
   join public.classes c on c.id=st.class_id
   where a.schedule_id=p_schedule order by c.code,st.full_name
 loop
   perform public.cbt_v17_recalc_internal(v_att.id);
   select coalesce(sum(g.auto_points),0),coalesce(sum(g.manual_points),0),count(*)
     into v_auto,v_manual,v_answered
   from public.exam_answer_grades g where g.attempt_id=v_att.id;
   select count(*) into v_pending from public.student_answers sa
     join public.questions q on q.id=sa.question_id and q.bank_id=v_bank and q.kind='esai'
     left join public.exam_answer_grades g on g.attempt_id=sa.attempt_id and g.question_id=sa.question_id
     where sa.attempt_id=v_att.id and g.manual_points is null;
   v_result:=v_result||jsonb_build_array(jsonb_build_object(
     'attempt_id',v_att.id,'student_id',v_att.student_id,'nis',v_att.nis,'name',v_att.full_name,
     'class_name',v_att.class_name,'status',v_att.status,'submitted_at',v_att.submitted_at,
     'auto_points',v_auto,'manual_points',v_manual,'total_points',v_auto+v_manual,
     'maximum',v_max,'score_100',case when v_max>0 then round((v_auto+v_manual)*100/v_max,2) else 0 end,
     'pending_essay',v_pending,'answered',v_answered));
 end loop;
 return v_result;
end;$$;
revoke all on function public.cbt_v17_results(uuid) from public,anon;
grant execute on function public.cbt_v17_results(uuid) to authenticated;

create or replace function public.cbt_v17_detail(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_schedule uuid;v_bank uuid;v_rows jsonb;
begin
 select a.schedule_id,s.bank_id into v_schedule,v_bank
 from public.exam_attempts a join public.exam_schedules s on s.id=a.schedule_id where a.id=p_attempt;
 if v_schedule is null or not public.cbt_v17_can_grade_schedule(v_schedule) then
    raise exception 'Tidak berhak melihat pengerjaan';end if;
 perform public.cbt_v17_recalc_internal(p_attempt);
 select coalesce(jsonb_agg(jsonb_build_object(
     'question_id',q.id,'position',q.position,'kind',q.kind,'prompt',q.prompt,
     'max_points',q.points,'student_answer',sa.answer,'rubric',
     case when q.kind='esai' then k.answer->>'rubric' else null end,
     'auto_points',coalesce(g.auto_points,0),'manual_points',g.manual_points,
     'feedback',coalesce(g.feedback,''),'graded_by',g.graded_by,'graded_at',g.graded_at
 ) order by q.position,q.id), '[]'::jsonb) into v_rows
 from public.questions q
 left join public.student_answers sa on sa.question_id=q.id and sa.attempt_id=p_attempt
 left join public.exam_answer_grades g on g.question_id=q.id and g.attempt_id=p_attempt
 left join public.question_keys k on k.question_id=q.id
 where q.bank_id=v_bank;
 return v_rows;
end;$$;
revoke all on function public.cbt_v17_detail(uuid) from public,anon;
grant execute on function public.cbt_v17_detail(uuid) to authenticated;

create or replace function public.cbt_v17_grade_essay(
 p_attempt uuid,p_question uuid,p_points numeric,p_feedback text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare v_schedule uuid;v_bank uuid;v_status text;v_max numeric;v_old numeric;v_old_feedback text;
begin
 select a.schedule_id,s.bank_id,a.status into v_schedule,v_bank,v_status
 from public.exam_attempts a join public.exam_schedules s on s.id=a.schedule_id
 where a.id=p_attempt for update of a;
 if v_schedule is null or not public.cbt_v17_can_grade_schedule(v_schedule) then
   raise exception 'Tidak berhak mengoreksi esai';end if;
 if v_status<>'selesai' then raise exception 'Hanya pengerjaan selesai yang bisa dikoreksi';end if;
 select q.points into v_max from public.questions q where q.id=p_question and q.bank_id=v_bank and q.kind='esai';
 if v_max is null then raise exception 'Soal esai tidak ditemukan pada bank jadwal';end if;
 if p_points is null or p_points<0 or p_points>v_max then
    raise exception 'Nilai esai harus antara 0 dan %',v_max;end if;
 if length(coalesce(p_feedback,''))>2000 then raise exception 'Catatan maksimal 2000 karakter';end if;
 if not exists(select 1 from public.student_answers
      where attempt_id=p_attempt and question_id=p_question) then
    raise exception 'Siswa belum mengirim jawaban esai';end if;
 perform public.cbt_v17_recalc_internal(p_attempt);
 select manual_points,feedback into v_old,v_old_feedback from public.exam_answer_grades
 where attempt_id=p_attempt and question_id=p_question for update;
 update public.exam_answer_grades set manual_points=round(p_points,2),feedback=coalesce(p_feedback,''),
    graded_by=auth.uid(),graded_at=now()
 where attempt_id=p_attempt and question_id=p_question;
 if not found then raise exception 'Baris penilaian tidak ditemukan';end if;
 if v_old is distinct from round(p_points,2) or v_old_feedback is distinct from coalesce(p_feedback,'') then
   insert into public.exam_grade_audit(attempt_id,question_id,old_points,new_points,old_feedback,new_feedback,changed_by)
   values(p_attempt,p_question,v_old,round(p_points,2),v_old_feedback,coalesce(p_feedback,''),auth.uid());
 end if;
end;$$;
revoke all on function public.cbt_v17_grade_essay(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.cbt_v17_grade_essay(uuid,uuid,numeric,text) to authenticated;

create or replace function public.cbt_v17_audit(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_schedule uuid;v_rows jsonb;
begin
 select schedule_id into v_schedule from public.exam_attempts where id=p_attempt;
 if v_schedule is null or not public.cbt_v17_can_grade_schedule(v_schedule) then
   raise exception 'Tidak berhak melihat riwayat koreksi';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'question_id',a.question_id,'old_points',a.old_points,'new_points',a.new_points,
   'old_feedback',a.old_feedback,'new_feedback',a.new_feedback,'changed_at',a.changed_at,
   'changed_by',coalesce(p.full_name,'Pengguna')
 ) order by a.changed_at desc,a.id desc),'[]'::jsonb) into v_rows
 from public.exam_grade_audit a left join public.profiles p on p.id=a.changed_by
 where a.attempt_id=p_attempt;
 return v_rows;
end;$$;
revoke all on function public.cbt_v17_audit(uuid) from public,anon;
grant execute on function public.cbt_v17_audit(uuid) to authenticated;

-- Tidak ada kebijakan yang memberikan siswa akses langsung ke kunci atau nilai guru.
-- Menambah tabel penilaian, tanpa mengubah jawaban/pengerjaan yang telah tersimpan.
