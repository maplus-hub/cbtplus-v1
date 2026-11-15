-- CBTPlus v1.9.1: Alur siswa Mode Instan. Setelah SQL 015, 017.
-- Tidak membuktikan submit Google Form. Pengawas memverifikasi secara manual.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cbt_instant_student_progress (
  schedule_id uuid NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.exam_rooms(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('form_dibuka','menunggu_izin','keluar_diizinkan')),
  opened_at timestamptz,
  requested_at timestamptz,
  exited_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(schedule_id,student_id)
);
ALTER TABLE public.cbt_instant_student_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cbt_instant_student_progress FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cbt_instant_student_progress TO service_role;

-- Semua operasi hanya melalui Edge Function token-center dengan sesi siswa.
CREATE OR REPLACE FUNCTION public.cbt_v191_instant_action(
  p_session text,p_device text,p_action text,p_token text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_auth jsonb;v_student uuid;v_schedule uuid;v_room uuid;
  v_period uuid;v_mode text;v_now timestamptz:=clock_timestamp();
  v_supervisor text;v_hash text;v_status text;v_progress text;
BEGIN
  IF p_action NOT IN ('form_opened','request_exit','exit') THEN
    RAISE EXCEPTION 'Aksi Mode Instan tidak dikenal';
  END IF;
  -- Validate student session + bound device + schedule + active enrollment.
  v_auth := public.cbt_v19_verify(p_session,p_device);
  v_student := (v_auth->>'student_id')::uuid;
  v_schedule := (v_auth->>'schedule_id')::uuid;
  v_room := (v_auth->>'room_id')::uuid;
  SELECT s.period_id,b.delivery_mode INTO v_period,v_mode
    FROM public.exam_schedules s JOIN public.question_banks b ON b.id=s.bank_id
   WHERE s.id=v_schedule AND s.status='published';
  IF v_mode IS DISTINCT FROM 'instant_form' THEN
    RAISE EXCEPTION 'Aksi ini hanya untuk ujian Google Form';
  END IF;
  IF p_action='form_opened' THEN
    IF COALESCE((v_auth->>'can_start')::boolean,false)=false THEN
      RAISE EXCEPTION 'Form belum dapat dibuka di luar jadwal';
    END IF;
    INSERT INTO public.cbt_instant_student_progress(schedule_id,student_id,room_id,status,opened_at)
    VALUES(v_schedule,v_student,v_room,'form_dibuka',v_now)
    ON CONFLICT(schedule_id,student_id) DO UPDATE SET
      opened_at=COALESCE(public.cbt_instant_student_progress.opened_at,excluded.opened_at),
      status=CASE WHEN public.cbt_instant_student_progress.status='keluar_diizinkan'
                  THEN public.cbt_instant_student_progress.status ELSE 'form_dibuka' END,
      updated_at=v_now;
    v_progress:='form_dibuka';
  ELSIF p_action='request_exit' THEN
    SELECT status INTO v_status FROM public.cbt_instant_student_progress
      WHERE schedule_id=v_schedule AND student_id=v_student FOR UPDATE;
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Buka Google Form terlebih dahulu';
    END IF;
    IF v_status='keluar_diizinkan' THEN
      RAISE EXCEPTION 'Sesi sudah selesai';
    END IF;
    UPDATE public.cbt_instant_student_progress
      SET status='menunggu_izin',requested_at=v_now,updated_at=v_now
      WHERE schedule_id=v_schedule AND student_id=v_student;
    v_progress:='menunggu_izin';
  ELSE
    -- At least a recorded request, explicit supervisor confirmation, AND current room token.
    SELECT status INTO v_status FROM public.cbt_instant_student_progress
      WHERE schedule_id=v_schedule AND student_id=v_student FOR UPDATE;
    IF v_status IS DISTINCT FROM 'menunggu_izin' THEN
      RAISE EXCEPTION 'Siswa harus meminta izin keluar terlebih dahulu';
    END IF;
    SELECT status INTO v_supervisor FROM public.cbt_instant_supervisor_status
      WHERE schedule_id=v_schedule AND student_id=v_student
        AND period_id=v_period AND room_id=v_room;
    IF v_supervisor IS DISTINCT FROM 'selesai_dilaporkan' THEN
      RAISE EXCEPTION 'Pengawas belum mengonfirmasi bahwa ujian telah selesai';
    END IF;
    SELECT token_hash INTO v_hash FROM public.cbt_room_override_tokens
      WHERE period_id=v_period AND room_id=v_room;
    IF v_hash IS NULL OR v_hash<>extensions.crypt(COALESCE(p_token,''),v_hash) THEN
      RAISE EXCEPTION 'Token izin keluar tidak sesuai';
    END IF;
    UPDATE public.cbt_instant_student_progress
      SET status='keluar_diizinkan',exited_at=v_now,updated_at=v_now
      WHERE schedule_id=v_schedule AND student_id=v_student;
    UPDATE public.cbt_student_sessions SET revoked_at=v_now
      WHERE session_hash=encode(extensions.digest(p_session,'sha256'),'hex')
        AND device_hash=encode(extensions.digest(p_device,'sha256'),'hex')
        AND student_id=v_student AND schedule_id=v_schedule;
    v_progress:='keluar_diizinkan';
  END IF;
  INSERT INTO public.cbt_supervisor_audit(period_id,room_id,action,actor)
    VALUES(v_period,v_room,'instant_student:'||p_action||':'||v_schedule::text||':'||v_student::text,'student_session');
  RETURN jsonb_build_object('ok',true,'status',v_progress);
END $$;
REVOKE ALL ON FUNCTION public.cbt_v191_instant_action(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_v191_instant_action(text,text,text,text) TO service_role;
COMMIT;
