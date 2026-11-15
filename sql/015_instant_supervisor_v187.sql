-- CBTPlus v1.8.7 | Pemantauan manual Google Form oleh pengawas
-- Prasyarat: 011_token_center_v181.sql dan 014_instant_form_banks_v186.sql
-- Cadangkan DB; jalankan sekali melalui Supabase SQL Editor.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cbt_instant_supervisor_status (
  period_id uuid NOT NULL REFERENCES public.exam_periods(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.exam_rooms(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('diarahkan','selesai_dilaporkan')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(schedule_id,student_id)
);
ALTER TABLE public.cbt_instant_supervisor_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cbt_instant_supervisor_status FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.cbt_instant_supervisor_status TO service_role;

CREATE OR REPLACE FUNCTION public.cbt_v187_mark_instant(
  p_session text,p_schedule uuid,p_student uuid,p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_auth jsonb;v_period uuid;v_room uuid;v_row public.cbt_instant_supervisor_status%ROWTYPE;
BEGIN
  -- verify_supervisor returns period and room for this valid (non-revoked) session
  v_auth := public.cbt_v181_verify_supervisor(p_session);
  v_period := (v_auth->>'period_id')::uuid;
  v_room := (v_auth->>'room_id')::uuid;
  IF p_status NOT IN ('diarahkan','selesai_dilaporkan','reset') THEN
    RAISE EXCEPTION 'Status eksternal tidak dikenal';
  END IF;
  -- Student MUST be placed in this supervisor's room for this period and
  -- be enrolled in the class of this published instant-form schedule.
  PERFORM 1 FROM public.exam_schedules s
    JOIN public.question_banks b ON b.id=s.bank_id AND b.delivery_mode='instant_form'
    JOIN public.room_assignments ra ON ra.period_id=s.period_id AND ra.student_id=p_student
    JOIN public.students st ON st.id=p_student AND st.class_id=s.class_id
   WHERE s.id=p_schedule AND s.period_id=v_period AND s.status='published'
     AND ra.room_id=v_room;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peserta/jadwal bukan Google Form terbit pada ruang pengawas ini';
  END IF;
  -- Lock the schedule row to serialize updates alongside administrative edits.
  PERFORM 1 FROM public.exam_schedules WHERE id=p_schedule FOR SHARE;
  IF p_status='reset' THEN
    DELETE FROM public.cbt_instant_supervisor_status
      WHERE schedule_id=p_schedule AND student_id=p_student AND period_id=v_period AND room_id=v_room;
  ELSE
    INSERT INTO public.cbt_instant_supervisor_status(period_id,schedule_id,student_id,room_id,status)
      VALUES(v_period,p_schedule,p_student,v_room,p_status)
    ON CONFLICT(schedule_id,student_id) DO UPDATE
      SET status=excluded.status,room_id=excluded.room_id,
          period_id=excluded.period_id,updated_at=clock_timestamp();
  END IF;
  INSERT INTO public.cbt_supervisor_audit(period_id,room_id,action,actor)
    VALUES(v_period,v_room,'instant:'||p_status||':'||p_schedule::text||':'||p_student::text,'supervisor');
  RETURN jsonb_build_object('ok',true,'status',p_status);
END $$;
REVOKE ALL ON FUNCTION public.cbt_v187_mark_instant(text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_v187_mark_instant(text,uuid,uuid,text) TO service_role;
COMMIT;
