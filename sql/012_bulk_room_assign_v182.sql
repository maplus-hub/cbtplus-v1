-- CBTPlus v1.8.2: transactional bulk room assignment, consecutive free seat numbers.
-- Run AFTER sql/001_schema.sql, and back up production data before running.
create or replace function public.assign_students_room_bulk_v182(
  p_period uuid, p_room uuid, p_students uuid[]
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_capacity integer;
  v_id uuid;
  v_seat integer;
  v_old public.room_assignments%rowtype;
  v_count integer := 0;
  v_total integer;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang berhak menempatkan siswa';
  end if;
  if p_period is null or p_room is null or p_students is null
    or cardinality(p_students)=0 or cardinality(p_students)>500 then
    raise exception 'Periode, ruang, dan pilihan siswa wajib valid (maksimal 500)';
  end if;
  -- One batch per period at a time: protects capacity/seat under concurrency.
  perform pg_advisory_xact_lock(hashtextextended(p_period::text,0));
  if not exists(select 1 from public.exam_periods where id=p_period) then
    raise exception 'Periode ujian tidak ditemukan';
  end if;
  select capacity into v_capacity from public.exam_rooms where id=p_room for update;
  if not found then raise exception 'Ruang ujian tidak ditemukan'; end if;
  select count(distinct u.id) into v_total from unnest(p_students) u(id);
  if v_total <> cardinality(p_students) then
    raise exception 'Daftar siswa mengandung ID ganda';
  end if;
  if (select count(*) from public.students s
        where s.id=any(p_students) and s.status='Aktif') <> v_total then
    raise exception 'Siswa tidak ditemukan atau berstatus Nonaktif';
  end if;
  -- Do not move students who already started an exam in this period.
  if exists(select 1 from public.exam_attempts a
      join public.exam_schedules sch on sch.id=a.schedule_id
      where sch.period_id=p_period and a.student_id=any(p_students)
       and (a.started_at is not null or a.status <> 'belum_mulai')) then
    raise exception 'Ada siswa yang sudah mulai ujian. Penempatan tidak boleh diubah.';
  end if;
  if (select count(*) from public.room_assignments a
       where a.period_id=p_period and a.room_id=p_room)
     + (select count(*) from unnest(p_students) u(id)
        where not exists(select 1 from public.room_assignments a
          where a.period_id=p_period and a.student_id=u.id and a.room_id=p_room)) > v_capacity then
    raise exception 'Kapasitas ruang tidak cukup';
  end if;
  for v_id in select u.id from unnest(p_students) with ordinality u(id,ord) order by u.ord loop
    select * into v_old from public.room_assignments
       where period_id=p_period and student_id=v_id for update;
    if found and v_old.room_id=p_room then
      continue; -- Keep previous seat, no unnecessary reshuffle.
    end if;
    select gs.n into v_seat from generate_series(1,v_capacity) gs(n)
      where not exists(select 1 from public.room_assignments a
        where a.period_id=p_period and a.room_id=p_room and a.seat_number=gs.n)
      order by gs.n limit 1;
    if v_seat is null then raise exception 'Tidak ada nomor kursi kosong'; end if;
    insert into public.room_assignments(period_id,student_id,room_id,seat_number,assigned_by)
     values(p_period,v_id,p_room,v_seat,auth.uid())
     on conflict(period_id,student_id) do update
     set room_id=excluded.room_id,seat_number=excluded.seat_number,
         assigned_at=now(),assigned_by=auth.uid();
    insert into public.room_assignment_logs(period_id,student_id,old_room_id,new_room_id,old_seat,new_seat,changed_by)
     values(p_period,v_id,v_old.room_id,p_room,v_old.seat_number,v_seat,auth.uid());
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.assign_students_room_bulk_v182(uuid,uuid,uuid[]) from public;
revoke all on function public.assign_students_room_bulk_v182(uuid,uuid,uuid[]) from anon;
grant execute on function public.assign_students_room_bulk_v182(uuid,uuid,uuid[]) to authenticated;
