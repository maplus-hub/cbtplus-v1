-- CBTPlus v1.6 - Jalankan setelah migrasi 001..005.
-- Mengimpor soal secara atomik, mengatur bobot, dan melindungi bank soal pada sesi published/closed atau yang punya attempts.

create or replace function public.is_bank_editable(p_bank_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select not exists (
   select 1 from public.exam_schedules s
   where s.bank_id=p_bank_id and (
     s.status in ('published','closed') or
     exists(select 1 from public.exam_attempts a where a.schedule_id=s.id)
   )
 );
$$;
revoke all on function public.is_bank_editable(uuid) from public;
grant execute on function public.is_bank_editable(uuid) to authenticated;

-- Lindungi modifikasi langsung di tabel maupun melalui RPC.
create or replace function public.guard_exam_bank_question()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_bank uuid;
begin
  if tg_table_name='question_keys' then
    select bank_id into v_bank from public.questions where id=coalesce(new.question_id,old.question_id);
  else
    v_bank:=coalesce(new.bank_id,old.bank_id);
  end if;
  if v_bank is not null and not public.is_bank_editable(v_bank) then
    raise exception 'Bank soal terkunci karena dipakai ujian yang sudah diterbitkan atau memiliki pengerjaan';
  end if;
  if tg_table_name='questions' and tg_op='UPDATE' and old.bank_id is distinct from new.bank_id and not public.is_bank_editable(old.bank_id) then
    raise exception 'Tidak boleh memindahkan soal keluar dari bank terkunci';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists guard_exam_questions on public.questions;
create trigger guard_exam_questions before insert or update or delete on public.questions
for each row execute function public.guard_exam_bank_question();
drop trigger if exists guard_exam_keys on public.question_keys;
create trigger guard_exam_keys before insert or update or delete on public.question_keys
for each row execute function public.guard_exam_bank_question();

create or replace function public.import_bank_questions(p_bank_id uuid,p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;v_role text;v_row jsonb;v_index integer:=0;v_position integer;v_id uuid;
begin
 if auth.uid() is null then raise exception 'Login diperlukan'; end if;
 select owner_id into v_owner from public.question_banks where id=p_bank_id for update;
 if v_owner is null then raise exception 'Bank soal tidak ditemukan'; end if;
 select role into v_role from public.profiles where id=auth.uid();
 if v_role is distinct from 'admin' and v_owner<>auth.uid() then raise exception 'Tidak berhak mengimpor soal'; end if;
 if not public.is_bank_editable(p_bank_id) then raise exception 'Bank soal terkunci karena sudah digunakan untuk ujian'; end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Format data harus array'; end if;
 if jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>200 then raise exception 'Jumlah impor 1-200 soal'; end if;
 select coalesce(max(position),0) into v_position from public.questions where bank_id=p_bank_id;
 for v_row in select value from jsonb_array_elements(p_rows) loop
   v_index:=v_index+1;
   if jsonb_typeof(v_row)<>'object' then raise exception 'Baris % bukan objek',v_index;end if;
   -- Menggunakan validator RPC v1.1; setiap kegagalan membatalkan seluruh transaksi.
   v_id:=public.save_bank_question(
     p_bank_id,null,
     v_row->>'kind',v_row->>'prompt',
     v_row->'options',v_row->'answer',
     (v_row->>'points')::numeric,v_position+v_index,
     nullif(v_row->>'explanation','')
   );
 end loop;
 return v_index;
end;
$$;
revoke all on function public.import_bank_questions(uuid,jsonb) from public;
grant execute on function public.import_bank_questions(uuid,jsonb) to authenticated;

create or replace function public.set_bank_kind_weights(p_bank_id uuid,p_weights jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;v_role text;v_kind text;v_weight numeric;v_count integer:=0;v_rows integer;
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 select owner_id into v_owner from public.question_banks where id=p_bank_id for update;
 if v_owner is null then raise exception 'Bank soal tidak ditemukan';end if;
 select role into v_role from public.profiles where id=auth.uid();
 if v_role is distinct from 'admin' and v_owner<>auth.uid() then raise exception 'Tidak berhak mengubah bobot';end if;
 if not public.is_bank_editable(p_bank_id) then raise exception 'Bank soal terkunci karena sudah digunakan untuk ujian';end if;
 if jsonb_typeof(p_weights)<>'object' then raise exception 'Format bobot salah';end if;
 foreach v_kind in array array['pg','mcma','kategori','esai'] loop
   if jsonb_typeof(p_weights->v_kind)<>'number' then raise exception 'Bobot % harus angka',v_kind;end if;
   v_weight:=(p_weights->>v_kind)::numeric;
   if v_weight<=0 or v_weight>10000 then raise exception 'Bobot % di luar batas',v_kind;end if;
   update public.questions set points=v_weight where bank_id=p_bank_id and kind=v_kind;
   get diagnostics v_rows=row_count;
   v_count:=v_count+v_rows;
 end loop;
 return v_count;
end;
$$;
revoke all on function public.set_bank_kind_weights(uuid,jsonb) from public;
grant execute on function public.set_bank_kind_weights(uuid,jsonb) to authenticated;

-- Tidak mengubah ataupun menghapus soal dan nilai yang sudah ada.
