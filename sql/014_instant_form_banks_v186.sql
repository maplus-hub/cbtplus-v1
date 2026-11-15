-- CBTPlus v1.8.6 | Bank Soal Mode Instan / Google Forms
-- Prasyarat: migrasi 013_multi_class_banks_v184.sql
-- BACKUP DATABASE sebelum menjalankan. Data lama default internal.
BEGIN;

ALTER TABLE public.question_banks
 ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'internal';
ALTER TABLE public.question_banks
 ADD COLUMN IF NOT EXISTS form_url text;

ALTER TABLE public.question_banks
 DROP CONSTRAINT IF EXISTS question_banks_delivery_mode_check;
ALTER TABLE public.question_banks
 ADD CONSTRAINT question_banks_delivery_mode_check
 CHECK (delivery_mode IN ('internal','instant_form'));

ALTER TABLE public.question_banks
 DROP CONSTRAINT IF EXISTS question_banks_instant_form_url_check;
ALTER TABLE public.question_banks
 ADD CONSTRAINT question_banks_instant_form_url_check
 CHECK (
   (delivery_mode='internal' AND form_url IS NULL)
   OR
   (delivery_mode='instant_form' AND form_url IS NOT NULL
     AND length(form_url) BETWEEN 20 AND 2000
     AND form_url ~* '^https://(docs[.]google[.]com/forms/(d|d/e)/[^[:space:]/]+/viewform([?][^[:space:]]*)?|forms[.]gle/[A-Za-z0-9_-]+([?][^[:space:]]*)?)$')
 );

-- Blokir pembentukan soal internal pada bank mode Google Form.
CREATE OR REPLACE FUNCTION public.guard_instant_form_questions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.question_banks b
            WHERE b.id=NEW.bank_id AND b.delivery_mode='instant_form') THEN
   RAISE EXCEPTION 'Bank mode instan tidak menerima soal internal';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS instant_form_question_guard ON public.questions;
CREATE TRIGGER instant_form_question_guard
 BEFORE INSERT OR UPDATE OF bank_id ON public.questions
 FOR EACH ROW EXECUTE FUNCTION public.guard_instant_form_questions();

-- Akses perubahan mode/tautan hanya melalui RPC staf, bukan UPDATE kolom secara bebas.
-- Pemilik atau admin dapat mengelola bank sesuai fungsi v1.8.4.
CREATE OR REPLACE FUNCTION public.save_bank_with_classes_instant(
 p_bank_id uuid, p_title text, p_subject_id uuid,
 p_class_ids uuid[] DEFAULT '{}'::uuid[],
 p_delivery_mode text DEFAULT 'internal', p_form_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_old public.question_banks%ROWTYPE; v_url text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN
   RAISE EXCEPTION 'Hanya admin/guru yang dapat membuat bank';
 END IF;
 IF p_delivery_mode NOT IN ('internal','instant_form') THEN
   RAISE EXCEPTION 'Mode bank tidak dikenal';
 END IF;
 v_url:=CASE WHEN p_delivery_mode='instant_form' THEN btrim(coalesce(p_form_url,'')) ELSE NULL END;
 IF p_delivery_mode='instant_form' AND
    (length(v_url)<20 OR length(v_url)>2000 OR v_url !~* '^https://(docs[.]google[.]com/forms/(d|d/e)/[^[:space:]/]+/viewform([?][^[:space:]]*)?|forms[.]gle/[A-Za-z0-9_-]+([?][^[:space:]]*)?)$') THEN
   RAISE EXCEPTION 'Masukkan tautan Google Form HTTPS yang valid (docs.google.com/forms/... atau forms.gle/...)';
 END IF;
 IF p_bank_id IS NOT NULL THEN
   SELECT * INTO v_old FROM public.question_banks WHERE id=p_bank_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Bank tidak ditemukan'; END IF;
   IF (v_old.delivery_mode IS DISTINCT FROM p_delivery_mode OR v_old.form_url IS DISTINCT FROM v_url)
      AND NOT public.is_bank_editable(p_bank_id) THEN
     RAISE EXCEPTION 'Mode/link bank tidak dapat diganti setelah ujian terbit atau memiliki pengerjaan';
   END IF;
   IF p_delivery_mode='instant_form' AND v_old.delivery_mode<>'instant_form' AND EXISTS (
       SELECT 1 FROM public.questions q WHERE q.bank_id=p_bank_id
   ) THEN
     RAISE EXCEPTION 'Bank memiliki soal internal. Buat bank instan baru agar soal lama aman';
   END IF;
 END IF;
 -- Fungsi bawaan v1.8.4 memvalidasi mapel, kelas tujuan, dan pemilik bank.
 v_id:=public.save_bank_with_classes(p_bank_id,p_title,p_subject_id,p_class_ids);
 UPDATE public.question_banks
 SET delivery_mode=p_delivery_mode, form_url=v_url
 WHERE id=v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_bank_with_classes_instant(uuid,text,uuid,uuid[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_bank_with_classes_instant(uuid,text,uuid,uuid[],text,text) TO authenticated;

-- Blokir tautan/mode yang berubah lewat direct table UPDATE sesudah sesi diterbitkan.
CREATE OR REPLACE FUNCTION public.guard_instant_form_mode_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (NEW.delivery_mode IS DISTINCT FROM OLD.delivery_mode OR NEW.form_url IS DISTINCT FROM OLD.form_url)
   AND NOT public.is_bank_editable(OLD.id) THEN
   RAISE EXCEPTION 'Bank sudah digunakan dalam sesi ujian terbit atau memiliki pengerjaan';
 END IF;
 IF NEW.delivery_mode='instant_form' AND OLD.delivery_mode<>'instant_form' AND EXISTS(
  SELECT 1 FROM public.questions q WHERE q.bank_id=NEW.id
 ) THEN
   RAISE EXCEPTION 'Bank memiliki soal internal, buat bank instan baru';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS instant_form_mode_update_guard ON public.question_banks;
CREATE TRIGGER instant_form_mode_update_guard
 BEFORE UPDATE OF delivery_mode,form_url ON public.question_banks
 FOR EACH ROW EXECUTE FUNCTION public.guard_instant_form_mode_update();

-- Pilot portal siswa internal tidak boleh menganggap Google Form sebagai bank soal CBT.
-- Aplikasi native kelak memakai alur khusus link eksternal + token pelajaran.
CREATE OR REPLACE FUNCTION public.guard_instant_form_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.exam_schedules s
   JOIN public.question_banks b ON b.id=s.bank_id
   WHERE s.id=NEW.schedule_id AND b.delivery_mode='instant_form'
 ) THEN
   RAISE EXCEPTION 'Ujian Google Form menggunakan alur eksternal, bukan pengerjaan CBT internal';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS instant_form_attempt_guard ON public.exam_attempts;
CREATE TRIGGER instant_form_attempt_guard
 BEFORE INSERT ON public.exam_attempts
 FOR EACH ROW EXECUTE FUNCTION public.guard_instant_form_attempt();

-- Saat jadwal di-publish, mode instan harus memiliki tautan yang valid.
CREATE OR REPLACE FUNCTION public.guard_instant_form_schedule_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_mode text;v_url text;
BEGIN
 IF NEW.status='published' AND NEW.bank_id IS NOT NULL THEN
   SELECT delivery_mode,form_url INTO v_mode,v_url
   FROM public.question_banks WHERE id=NEW.bank_id;
   IF v_mode='instant_form' AND v_url IS NULL THEN
     RAISE EXCEPTION 'Bank instan belum memiliki link Google Form';
   END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS instant_form_schedule_publish_guard ON public.exam_schedules;
CREATE TRIGGER instant_form_schedule_publish_guard
 BEFORE INSERT OR UPDATE OF bank_id,status ON public.exam_schedules
 FOR EACH ROW EXECUTE FUNCTION public.guard_instant_form_schedule_publish();

COMMIT;
