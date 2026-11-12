-- CBTPlus v1.1 - Run AFTER 001_schema.sql.
-- This adds JSON choices and a transactional authoring RPC. Do not expose service-role keys.
alter table public.questions add column if not exists options jsonb not null default '[]'::jsonb;
create index if not exists idx_questions_bank_position on public.questions(bank_id,position);

create or replace function public.save_bank_question(
  p_bank_id uuid,
  p_question_id uuid,
  p_kind text,
  p_prompt text,
  p_options jsonb,
  p_answer jsonb,
  p_points numeric,
  p_position integer,
  p_explanation text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_owner uuid; v_role text; v_choice_count int; v_key text;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  select owner_id into v_owner from public.question_banks where id=p_bank_id;
  if v_owner is null then raise exception 'Bank soal tidak ditemukan'; end if;
  if v_role is distinct from 'admin' and v_owner <> auth.uid() then raise exception 'Anda bukan pemilik bank soal'; end if;
  if p_kind not in ('pg','mcma','kategori','esai') then raise exception 'Jenis soal tidak valid'; end if;
  if length(trim(coalesce(p_prompt,''))) < 5 then raise exception 'Isi soal minimal 5 karakter'; end if;
  if p_points is null or p_points < 0 or p_points > 10000 then raise exception 'Bobot tidak valid'; end if;
  if p_position is null or p_position < 1 then raise exception 'Nomor soal tidak valid'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_typeof(p_answer) <> 'object' then raise exception 'Format pilihan/kunci tidak valid'; end if;
  v_choice_count := jsonb_array_length(p_options);
  if p_kind in ('pg','mcma') then
    if v_choice_count < 2 or v_choice_count > 5 or exists (select 1 from jsonb_array_elements_text(p_options) t(v) where length(trim(v))=0) then
      raise exception 'Pilihan harus berisi 2-5 teks yang tidak kosong';
    end if;
    if p_kind='pg' then
      v_key:=p_answer->>'correct';
      if v_key is null or length(v_key)<>1 or ascii(v_key)<65 or ascii(v_key)>=65+v_choice_count then raise exception 'Kunci PG tidak valid'; end if;
    else
      if jsonb_typeof(p_answer->'correct')<>'array' or jsonb_array_length(p_answer->'correct')=0 then raise exception 'Pilih minimal satu kunci MCMA'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_answer->'correct') t(v) where length(v)<>1 or ascii(v)<65 or ascii(v)>=65+v_choice_count) then raise exception 'Kunci MCMA tidak valid'; end if;
      if (select count(*) from jsonb_array_elements_text(p_answer->'correct'))<>(select count(distinct v) from jsonb_array_elements_text(p_answer->'correct') t(v)) then raise exception 'Kunci MCMA duplikat'; end if;
    end if;
  elsif p_kind='kategori' then
    if v_choice_count<2 or v_choice_count>10 or exists(select 1 from jsonb_array_elements_text(p_options) t(v) where length(trim(v))=0) then raise exception 'Kategori perlu 2-10 pernyataan'; end if;
    if jsonb_typeof(p_answer->'answers')<>'array' or jsonb_array_length(p_answer->'answers')<>v_choice_count then raise exception 'Kunci kategori harus sesuai jumlah pernyataan'; end if;
    if exists(select 1 from jsonb_array_elements(p_answer->'answers') a(v) where jsonb_typeof(v)<>'boolean') then raise exception 'Kunci kategori hanya benar/salah'; end if;
  else
    if length(trim(coalesce(p_answer->>'rubric','')))<3 then raise exception 'Esai perlu pedoman jawaban'; end if;
    if v_choice_count<>0 then raise exception 'Esai tidak memiliki opsi'; end if;
  end if;
  if p_question_id is null then
    insert into public.questions(bank_id,kind,prompt,options,points,position)
    values (p_bank_id,p_kind,trim(p_prompt),p_options,p_points,p_position)
    returning id into v_id;
  else
    update public.questions set kind=p_kind,prompt=trim(p_prompt),options=p_options,points=p_points,position=p_position
    where id=p_question_id and bank_id=p_bank_id returning id into v_id;
    if v_id is null then raise exception 'Soal tidak ditemukan di bank ini'; end if;
  end if;
  insert into public.question_keys(question_id,answer,explanation) values(v_id,p_answer,p_explanation)
  on conflict(question_id) do update set answer=excluded.answer,explanation=excluded.explanation;
  return v_id;
end;
$$;
revoke all on function public.save_bank_question(uuid,uuid,text,text,jsonb,jsonb,numeric,integer,text) from public;
grant execute on function public.save_bank_question(uuid,uuid,text,text,jsonb,jsonb,numeric,integer,text) to authenticated;
