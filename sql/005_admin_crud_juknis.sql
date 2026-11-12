-- CBTPlus v1.5 — Jalankan SETELAH 004_multi_exam_teachers.sql.
-- Aman terhadap data lama: seed hanya dilakukan bila jadwal periode target masih kosong.

-- Guru hanya boleh menghapus bank miliknya; admin boleh menghapus bank mana pun.
-- FK exam_schedules.bank_id akan MENOLAK penghapusan bank yang sedang dipakai jadwal.
DROP POLICY IF EXISTS banks_owner_delete ON public.question_banks;
CREATE POLICY banks_owner_delete ON public.question_banks
 FOR DELETE TO authenticated
 USING (public.is_admin() OR (public.is_staff() AND owner_id = (select auth.uid())));

-- Hanya admin boleh menghapus siswa. Jika ada rekam ujian/riwayat penempatan,
-- foreign key yang relevan akan mencegah tindakan destruktif; jangan CASCADE manual.
-- Policy students_admin_write sudah dibuat di 001_schema.sql.

CREATE OR REPLACE FUNCTION public.seed_juknis_asas_2026(p_period uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer := 0; r record; cl record; v_sub uuid; v_name text; v_start timestamptz; v_end timestamptz;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Hanya admin'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_period::text, 0));
 IF NOT EXISTS(SELECT 1 FROM public.exam_periods WHERE id=p_period AND title ILIKE '%ASAS%Gasal%' AND academic_year='2026/2027') THEN
  RAISE EXCEPTION 'Jadwal juknis ini hanya untuk ASAS Gasal 2026/2027';
 END IF;
 IF EXISTS (SELECT 1 FROM public.exam_schedules WHERE period_id=p_period) THEN
  RAISE EXCEPTION 'Periode sudah mempunyai jadwal; jangan timpa. Edit jadwal yang ada atau gunakan periode kosong.';
 END IF;
 FOR r IN SELECT * FROM (VALUES
  ('2026-11-27','07:30','09:00','Matematika','Matematika'),
  ('2026-11-27','09:30','11:00','Seni Teater','Seni Teater'),
  ('2026-11-28','07:30','08:45','Al-Qur’an Hadist','Al-Qur’an Hadist'),
  ('2026-11-28','08:45','10:00','Akidah Akhlak','Akidah Akhlak'),
  ('2026-11-28','10:40','11:55','Fiqih','Fiqih'),
  ('2026-11-30','08:00','09:30','Bahasa Inggris','Bahasa Inggris'),
  ('2026-11-30','10:15','11:45','Pendidikan Pancasila','Pendidikan Pancasila'),
  ('2026-12-01','08:00','09:30','Bahasa Arab','Bahasa Arab'),
  ('2026-12-01','10:15','11:45','Usul Fiqih','Biologi'),
  ('2026-12-02','08:00','09:30','Ekonomi','IPS Ekonomi-Sosiologi'),
  ('2026-12-02','10:15','11:45','Sejarah','Fisika'),
  ('2026-12-03','08:00','09:30','Sosiologi','IPS Sejarah-Geografi'),
  ('2026-12-03','10:15','11:45','SKI','SKI'),
  ('2026-12-04','07:30','09:00','Bahasa Indonesia','Bahasa Indonesia'),
  ('2026-12-04','09:30','11:00','PJOK','PJOK')
 ) AS x(d,tm_start,tm_end,subject_high,subject_x)
 LOOP
   FOR cl IN SELECT id, level FROM public.classes WHERE level IN (10,11,12) LOOP
     v_name := CASE WHEN cl.level=10 THEN r.subject_x ELSE r.subject_high END;
     INSERT INTO public.subjects(name) VALUES(v_name) ON CONFLICT(name) DO NOTHING;
     SELECT id INTO STRICT v_sub FROM public.subjects WHERE name=v_name;
     v_start := ((r.d||' '||r.tm_start)::timestamp AT TIME ZONE 'Asia/Jakarta');
     v_end := ((r.d||' '||r.tm_end)::timestamp AT TIME ZONE 'Asia/Jakarta');
     INSERT INTO public.exam_schedules(period_id,subject_id,class_id,bank_id,starts_at,ends_at,status,instructions)
     VALUES(p_period,v_sub,cl.id,NULL,v_start,v_end,'draft','Jadwal awal dari juknis ASAS Gasal 2026/2027; lengkapi bank soal sebelum publikasi');
     n:=n+1;
   END LOOP;
 END LOOP;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.seed_juknis_asas_2026(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_juknis_asas_2026(uuid) TO authenticated;

-- Isi otomatis periode awal hanya jika benar-benar belum memiliki jadwal.
-- Tidak mengubah jadwal yang sudah diisi admin.
DO $$ DECLARE v_period uuid; BEGIN
 SELECT id INTO v_period FROM public.exam_periods
 WHERE title ILIKE '%ASAS%Gasal%' AND academic_year='2026/2027'
 ORDER BY created_at LIMIT 1;
 IF v_period IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_schedules WHERE period_id=v_period) THEN
  -- Security definer seed memeriksa admin; saat migrasi SQL tidak memiliki auth.uid().
  -- Admin dapat menjalankan melalui tombol "Terapkan Juknis" di dashboard.
  RAISE NOTICE 'Jadwal juknis tersedia melalui tombol Terapkan Juknis pada dashboard.';
 END IF;
END $$;

-- Jangan izinkan edit mata pelajaran/rombel bank membuat jadwal yang sudah tertaut inkonsisten.
CREATE OR REPLACE FUNCTION public.guard_bank_schedule_compatibility()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.exam_schedules e
  WHERE e.bank_id=NEW.id AND
    (e.subject_id<>NEW.subject_id OR (NEW.class_id IS NOT NULL AND e.class_id IS DISTINCT FROM NEW.class_id))
 ) THEN RAISE EXCEPTION 'Bank ini telah dipakai dalam jadwal; mata pelajaran/rombel tidak boleh diubah menjadi tidak cocok'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bank_schedule_compatibility ON public.question_banks;
CREATE TRIGGER bank_schedule_compatibility
BEFORE UPDATE OF subject_id,class_id ON public.question_banks
FOR EACH ROW EXECUTE FUNCTION public.guard_bank_schedule_compatibility();
