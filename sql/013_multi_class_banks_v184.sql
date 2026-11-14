-- CBTPlus v1.8.4 — Satu bank soal untuk beberapa rombel.
-- Jalankan setelah 005_admin_crud_juknis.sql dan migrasi yang telah digunakan sebelumnya.
-- Back up database terlebih dahulu. Tidak menghapus soal atau jadwal.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bank_class_targets (
  bank_id uuid NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  PRIMARY KEY (bank_id, class_id)
);
CREATE INDEX IF NOT EXISTS bank_class_targets_class_idx ON public.bank_class_targets(class_id);
ALTER TABLE public.bank_class_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_class_targets_staff_read ON public.bank_class_targets;
CREATE POLICY bank_class_targets_staff_read ON public.bank_class_targets
  FOR SELECT TO authenticated USING (public.is_staff());
-- Tidak ada kebijakan INSERT/UPDATE/DELETE dari frontend: hanya RPC terotorisasi.
REVOKE ALL ON public.bank_class_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bank_class_targets TO authenticated;

-- Backfill bank lama khusus satu kelas. Bank class_id NULL tetap berarti semua kelas.
INSERT INTO public.bank_class_targets(bank_id,class_id)
SELECT id,class_id FROM public.question_banks WHERE class_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Fungsi admin/guru membuat atau mengedit bank beserta rombel secara atomik.
CREATE OR REPLACE FUNCTION public.save_bank_with_classes(
 p_bank_id uuid, p_title text, p_subject_id uuid, p_class_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_bank public.question_banks%ROWTYPE;
 v_id uuid;
 v_classes uuid[];
 v_single uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN
   RAISE EXCEPTION 'Hanya admin atau guru yang dapat mengelola bank soal';
 END IF;
 IF nullif(btrim(p_title),'') IS NULL OR p_subject_id IS NULL THEN
   RAISE EXCEPTION 'Nama bank dan mata pelajaran wajib diisi';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subjects WHERE id=p_subject_id) THEN
   RAISE EXCEPTION 'Mata pelajaran tidak ditemukan';
 END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}'::uuid[])
 INTO v_classes
 FROM unnest(coalesce(p_class_ids,'{}'::uuid[])) AS t(x);
 IF cardinality(v_classes)>40 THEN RAISE EXCEPTION 'Terlalu banyak kelas tujuan'; END IF;
 IF EXISTS (
   SELECT 1 FROM unnest(v_classes) AS t(x)
   WHERE NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id=t.x)
 ) THEN RAISE EXCEPTION 'Ada kelas tujuan yang tidak terdaftar'; END IF;
 v_single := CASE WHEN cardinality(v_classes)=1 THEN v_classes[1] ELSE NULL END;

 IF p_bank_id IS NULL THEN
   INSERT INTO public.question_banks(title,subject_id,class_id,owner_id)
   VALUES (btrim(p_title),p_subject_id,v_single,auth.uid()) RETURNING id INTO v_id;
 ELSE
   SELECT * INTO v_bank FROM public.question_banks WHERE id=p_bank_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Bank soal tidak ditemukan'; END IF;
   IF NOT (public.is_admin() OR v_bank.owner_id=auth.uid()) THEN
     RAISE EXCEPTION 'Tidak diizinkan mengubah bank soal milik guru lain';
   END IF;
   -- Jangan sampai perubahan target membatalkan kesesuaian jadwal yang sudah ditautkan.
   IF EXISTS (
      SELECT 1 FROM public.exam_schedules s WHERE s.bank_id=p_bank_id
      AND (s.subject_id IS DISTINCT FROM p_subject_id OR
        (cardinality(v_classes)>0 AND (s.class_id IS NULL OR NOT (s.class_id=ANY(v_classes)))))
   ) THEN RAISE EXCEPTION 'Bank sudah digunakan pada jadwal kelas/mapel yang tidak termasuk pilihan'; END IF;
   UPDATE public.question_banks SET title=btrim(p_title), subject_id=p_subject_id,
     class_id=v_single WHERE id=p_bank_id;
   v_id:=p_bank_id;
 END IF;
 DELETE FROM public.bank_class_targets WHERE bank_id=v_id;
 INSERT INTO public.bank_class_targets(bank_id,class_id)
 SELECT v_id,t.x FROM unnest(v_classes) AS t(x);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_bank_with_classes(uuid,text,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_bank_with_classes(uuid,text,uuid,uuid[]) TO authenticated;

-- Menolak jadwal yang menghubungkan bank ke kelas lain / mapel tidak sesuai,
-- termasuk akses langsung dari SDK dan operasi publish.
CREATE OR REPLACE FUNCTION public.guard_schedule_bank_classes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_bank public.question_banks%ROWTYPE;
BEGIN
 IF NEW.bank_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v_bank FROM public.question_banks WHERE id=NEW.bank_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank soal tidak ditemukan'; END IF;
 IF NEW.subject_id IS DISTINCT FROM v_bank.subject_id THEN
   RAISE EXCEPTION 'Mata pelajaran jadwal tidak sama dengan bank soal';
 END IF;
 IF EXISTS(SELECT 1 FROM public.bank_class_targets t WHERE t.bank_id=NEW.bank_id) THEN
   IF NEW.class_id IS NULL OR NOT EXISTS(
     SELECT 1 FROM public.bank_class_targets t
     WHERE t.bank_id=NEW.bank_id AND t.class_id=NEW.class_id
   ) THEN RAISE EXCEPTION 'Kelas pada jadwal tidak diizinkan untuk bank soal ini'; END IF;
 ELSIF v_bank.class_id IS NOT NULL AND NEW.class_id IS DISTINCT FROM v_bank.class_id THEN
   RAISE EXCEPTION 'Bank soal hanya untuk kelas yang ditentukan';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS schedule_bank_classes_guard ON public.exam_schedules;
CREATE TRIGGER schedule_bank_classes_guard
BEFORE INSERT OR UPDATE OF subject_id,class_id,bank_id,status ON public.exam_schedules
FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_bank_classes();

-- Bila bank mata pelajaran diubah melalui SDK lama, tetap lakukan validasi jadwal.
-- Trigger bank_schedule_compatibility v1.5 tetap dipertahankan.
COMMIT;
