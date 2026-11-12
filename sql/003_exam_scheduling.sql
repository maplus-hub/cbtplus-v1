-- CBTPlus v1.2 — install AFTER 001_schema.sql and 002_question_editor.sql.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- Times are TIMESTAMPTZ; dashboard sends local Asia/Jakarta time as UTC ISO.
ALTER TABLE public.exam_schedules
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
 ADD COLUMN IF NOT EXISTS instructions text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='exam_schedule_status_check') THEN
  ALTER TABLE public.exam_schedules ADD CONSTRAINT exam_schedule_status_check CHECK(status IN ('draft','published','closed'));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS exam_schedule_period_time ON public.exam_schedules(period_id,starts_at,class_id);

-- The token hash is in a separate RLS-protected table, not included in schedule queries.
CREATE TABLE IF NOT EXISTS public.exam_schedule_tokens (
 schedule_id uuid PRIMARY KEY REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
 token_hash text NOT NULL,
 changed_by uuid REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exam_schedule_tokens ENABLE ROW LEVEL SECURITY;
-- No select or write policies: only security-definer RPCs may access this table.

-- Guard duplicate/overlapping sessions for a given class in a period.
CREATE OR REPLACE FUNCTION public.guard_exam_schedule() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_bank record;
BEGIN
 IF new.class_id IS NULL THEN RAISE EXCEPTION 'Pilih rombel peserta untuk jadwal CBT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(new.period_id::text || new.class_id::text, 0));
 IF EXISTS (
   SELECT 1 FROM public.exam_schedules e
   WHERE e.period_id=new.period_id AND e.class_id=new.class_id
   AND e.id IS DISTINCT FROM new.id AND e.status <> 'closed'
   AND tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')
 ) THEN RAISE EXCEPTION 'Jadwal rombel bertabrakan dengan sesi lain'; END IF;
 IF new.bank_id IS NOT NULL THEN
   SELECT b.subject_id,b.class_id INTO v_bank FROM public.question_banks b WHERE b.id=new.bank_id;
   IF NOT FOUND OR v_bank.subject_id <> new.subject_id OR (v_bank.class_id IS NOT NULL AND v_bank.class_id <> new.class_id)
   THEN RAISE EXCEPTION 'Bank soal harus sesuai mapel dan rombel'; END IF;
 END IF;
 IF new.status='published' THEN
   IF new.bank_id IS NULL THEN RAISE EXCEPTION 'Pilih bank soal sebelum publikasi'; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.bank_id=new.bank_id) THEN
     RAISE EXCEPTION 'Bank soal harus memiliki paling sedikit satu soal';
   END IF;
 END IF;
 new.updated_at=now();
 RETURN new;
END; $$;
DROP TRIGGER IF EXISTS exam_schedule_guard ON public.exam_schedules;
CREATE TRIGGER exam_schedule_guard BEFORE INSERT OR UPDATE ON public.exam_schedules
FOR EACH ROW EXECUTE FUNCTION public.guard_exam_schedule();

-- Token is shown only at time of setting; school staff never read hashes through the frontend.
CREATE OR REPLACE FUNCTION public.set_exam_token(p_schedule uuid, p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, extensions, public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Hanya admin'; END IF;
 IF length(trim(coalesce(p_token,''))) < 6 OR length(trim(p_token)) > 32
 THEN RAISE EXCEPTION 'Token harus 6-32 karakter'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.exam_schedules WHERE id=p_schedule AND status <> 'closed')
 THEN RAISE EXCEPTION 'Jadwal tidak ditemukan atau sudah ditutup'; END IF;
 INSERT INTO public.exam_schedule_tokens(schedule_id,token_hash,changed_by,changed_at)
 VALUES(p_schedule,extensions.crypt(p_token,extensions.gen_salt('bf',10)),auth.uid(),now())
 ON CONFLICT(schedule_id) DO UPDATE SET token_hash=excluded.token_hash,changed_by=excluded.changed_by,changed_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.set_exam_token(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_exam_token(uuid,text) TO authenticated;

-- Helper used by future student session endpoint; no direct permission to call from clients.
CREATE OR REPLACE FUNCTION public.internal_check_exam_token(p_schedule uuid,p_token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, extensions, public AS $$
 SELECT EXISTS(SELECT 1 FROM public.exam_schedule_tokens t
 WHERE t.schedule_id=p_schedule AND t.token_hash=extensions.crypt(p_token,t.token_hash));
$$;
REVOKE ALL ON FUNCTION public.internal_check_exam_token(uuid,text) FROM PUBLIC, anon, authenticated;

-- Prevent ordinary browser users from changing a published session back to a draft.
CREATE OR REPLACE FUNCTION public.guard_schedule_state() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP='UPDATE' AND old.status='closed' THEN RAISE EXCEPTION 'Sesi tertutup tidak boleh diedit'; END IF;
 IF TG_OP='UPDATE' AND old.status='published' AND new.status='draft' THEN RAISE EXCEPTION 'Tidak bisa mengembalikan sesi terbit ke draft'; END IF;
 IF TG_OP='DELETE' AND old.status <> 'draft' THEN RAISE EXCEPTION 'Hanya jadwal draft boleh dihapus'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN old ELSE new END;
END; $$;
DROP TRIGGER IF EXISTS exam_schedule_state_guard ON public.exam_schedules;
CREATE TRIGGER exam_schedule_state_guard BEFORE UPDATE OR DELETE ON public.exam_schedules
FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_state();
