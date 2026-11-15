-- CBTPlus v1.9 | Login siswa NIS + token pelajaran, tanpa akun email.
-- Prasyarat: 010,011,014 dan patch validasi 016, token-center v1.8.7.
-- Jalankan di SQL Editor setelah backup database. Fungsi hanya dipanggil service_role.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.cbt_student_login_limits (
  nis text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT clock_timestamp(),
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
CREATE TABLE IF NOT EXISTS public.cbt_student_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.exam_rooms(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  device_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS cbt_student_sessions_student_idx
  ON public.cbt_student_sessions(student_id,schedule_id,expires_at);
ALTER TABLE public.cbt_student_login_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_student_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cbt_student_login_limits,public.cbt_student_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cbt_student_login_limits,public.cbt_student_sessions TO service_role;

-- Token pelajaran cocok hanya jika NIS, kelas, penempatan, jadwal dan waktu cocok.
-- Batas login: maks 6 kegagalan / 15 menit per NIS. Proteksi global IP/WAF tetap dianjurkan.
CREATE OR REPLACE FUNCTION public.cbt_v19_login(p_nis text,p_token text,p_device text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_student record;v_s record;v_count int;v_start timestamptz;v_locked timestamptz;
        v_session text;v_exp timestamptz;v_now timestamptz:=clock_timestamp();
BEGIN
  IF length(btrim(coalesce(p_nis,''))) NOT BETWEEN 1 AND 40
     OR length(btrim(coalesce(p_token,''))) NOT BETWEEN 6 AND 32
     OR coalesce(p_device,'') !~ '^[a-fA-F0-9-]{36}$' THEN
    RAISE EXCEPTION 'Identitas atau token tidak valid';
  END IF;
  p_nis := btrim(p_nis);
  -- Serialize attempts per NIS; hashing does not reveal NIS in advisory lock.
  PERFORM pg_advisory_xact_lock(hashtext('cbt19:'||p_nis));
  INSERT INTO public.cbt_student_login_limits(nis) VALUES(p_nis) ON CONFLICT(nis) DO NOTHING;
  SELECT failed_count,window_start,locked_until INTO v_count,v_start,v_locked
    FROM public.cbt_student_login_limits WHERE nis=p_nis FOR UPDATE;
  IF v_locked IS NOT NULL AND v_locked>v_now THEN
    RETURN jsonb_build_object('ok',false,'error','Terlalu banyak percobaan. Hubungi pengawas atau coba setelah 15 menit.');
  END IF;
  IF v_start < v_now - interval '15 minutes' THEN
    UPDATE public.cbt_student_login_limits SET window_start=v_now,failed_count=0,locked_until=NULL WHERE nis=p_nis;
    v_count:=0;
  END IF;
  SELECT id,nis,full_name,class_id INTO v_student FROM public.students
    WHERE nis=btrim(p_nis) AND status='Aktif';
  IF FOUND THEN
    SELECT e.id,e.period_id,e.starts_at,e.ends_at,e.class_id,ra.room_id,
           b.delivery_mode,b.form_url,su.name AS subject_name,cl.code AS class_name
      INTO v_s FROM public.exam_schedules e
      JOIN public.room_assignments ra ON ra.period_id=e.period_id AND ra.student_id=v_student.id
      JOIN public.question_banks b ON b.id=e.bank_id
      JOIN public.subjects su ON su.id=e.subject_id
      JOIN public.classes cl ON cl.id=e.class_id
      JOIN public.exam_schedule_tokens t ON t.schedule_id=e.id
      WHERE e.class_id=v_student.class_id AND e.status='published'
        AND e.starts_at <= v_now + interval '15 minutes' AND e.ends_at > v_now
        AND t.token_hash=extensions.crypt(upper(btrim(p_token)),t.token_hash)
      ORDER BY e.starts_at DESC LIMIT 1;
  END IF;
  IF v_s.id IS NULL THEN
    v_count:=v_count+1;
    UPDATE public.cbt_student_login_limits SET failed_count=v_count,
      locked_until=CASE WHEN v_count>=6 THEN v_now+interval '15 minutes' ELSE NULL END
      WHERE nis=p_nis;
    RETURN jsonb_build_object('ok',false,'error','NIS, token, kelas, atau jadwal tidak sesuai.');
  END IF;
  UPDATE public.cbt_student_login_limits SET failed_count=0,locked_until=NULL,window_start=v_now WHERE nis=p_nis;
  -- Satu sesi aktif per siswa per jadwal: login baru membatalkan sesi lama.
  UPDATE public.cbt_student_sessions SET revoked_at=v_now
    WHERE student_id=v_student.id AND schedule_id=v_s.id AND revoked_at IS NULL;
  v_session:=encode(extensions.gen_random_bytes(32),'hex');
  v_exp:=least(v_now+interval '12 hours',v_s.ends_at+interval '30 minutes');
  INSERT INTO public.cbt_student_sessions(student_id,schedule_id,room_id,session_hash,device_hash,expires_at)
  VALUES(v_student.id,v_s.id,v_s.room_id,
    encode(extensions.digest(v_session,'sha256'),'hex'),
    encode(extensions.digest(p_device,'sha256'),'hex'),v_exp);
  RETURN jsonb_build_object('ok',true,'session',v_session,
    'student_name',v_student.full_name,'nis',v_student.nis,
    'class_name',v_s.class_name,'subject_name',v_s.subject_name,
    'delivery_mode',v_s.delivery_mode,'starts_at',v_s.starts_at,'ends_at',v_s.ends_at,
    'expires_at',v_exp);
END $$;

CREATE OR REPLACE FUNCTION public.cbt_v19_verify(p_session text,p_device text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row record;v_now timestamptz:=clock_timestamp();
BEGIN
 IF length(coalesce(p_session,''))<>64 OR coalesce(p_device,'') !~ '^[a-fA-F0-9-]{36}$' THEN
   RAISE EXCEPTION 'Sesi peserta tidak valid'; END IF;
 SELECT ss.id AS session_id,ss.student_id,ss.schedule_id,ss.room_id,
   st.nis,st.full_name,cl.code AS class_name,su.name AS subject_name,
   e.starts_at,e.ends_at,e.status AS schedule_status,
   b.delivery_mode,b.form_url,
   a.id AS attempt_id,a.status AS attempt_status
 INTO v_row FROM public.cbt_student_sessions ss
 JOIN public.students st ON st.id=ss.student_id AND st.status='Aktif'
 JOIN public.exam_schedules e ON e.id=ss.schedule_id AND e.status='published' AND e.class_id=st.class_id
 JOIN public.room_assignments ra ON ra.period_id=e.period_id AND ra.student_id=st.id AND ra.room_id=ss.room_id
 JOIN public.question_banks b ON b.id=e.bank_id
 JOIN public.classes cl ON cl.id=st.class_id JOIN public.subjects su ON su.id=e.subject_id
 LEFT JOIN public.exam_attempts a ON a.student_id=st.id AND a.schedule_id=e.id
 WHERE ss.session_hash=encode(extensions.digest(p_session,'sha256'),'hex')
   AND ss.device_hash=encode(extensions.digest(p_device,'sha256'),'hex')
   AND ss.revoked_at IS NULL AND ss.expires_at>v_now;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sesi siswa habis, dibatalkan, atau perangkat berbeda'; END IF;
 UPDATE public.cbt_student_sessions SET last_seen_at=v_now WHERE id=v_row.session_id;
 RETURN jsonb_build_object('student_id',v_row.student_id,'schedule_id',v_row.schedule_id,
   'room_id',v_row.room_id,'nis',v_row.nis,'student_name',v_row.full_name,
   'class_name',v_row.class_name,'subject_name',v_row.subject_name,
   'starts_at',v_row.starts_at,'ends_at',v_row.ends_at,
   'delivery_mode',v_row.delivery_mode,
   -- Form URL must not be disclosed before exam starts.
   'form_url',CASE WHEN v_now>=v_row.starts_at AND v_now<v_row.ends_at
       AND v_row.delivery_mode='instant_form' THEN v_row.form_url ELSE NULL END,
   'attempt_id',v_row.attempt_id,'attempt_status',v_row.attempt_status,
   'can_start',v_now>=v_row.starts_at AND v_now<v_row.ends_at);
END $$;

CREATE OR REPLACE FUNCTION public.cbt_v19_logout(p_session text,p_device text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.cbt_student_sessions SET revoked_at=clock_timestamp()
 WHERE session_hash=encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex')
   AND device_hash=encode(extensions.digest(coalesce(p_device,''),'sha256'),'hex');
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.cbt_v19_login(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cbt_v19_verify(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cbt_v19_logout(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_v19_login(text,text,text),
  public.cbt_v19_verify(text,text),public.cbt_v19_logout(text,text) TO service_role;
COMMIT;
