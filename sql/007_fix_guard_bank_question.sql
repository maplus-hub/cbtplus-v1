-- CBTPlus v1.6 hotfix: record "old" has no field "bank_id" (42703)
-- Jalankan SETELAH 006_bank_tools_v16.sql.
-- Aman terhadap data existing: hanya mengganti fungsi trigger.
-- Trigger guard_exam_questions dan guard_exam_keys tetap terpasang.

CREATE OR REPLACE FUNCTION public.guard_exam_bank_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bank uuid;
  v_old_bank uuid;
  v_new_bank uuid;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    -- OLD tidak tersedia pada INSERT; NEW tidak tersedia pada DELETE.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_old_bank := OLD.bank_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_new_bank := NEW.bank_id;
    END IF;

  ELSIF TG_TABLE_NAME = 'question_keys' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT q.bank_id INTO v_old_bank
      FROM public.questions q WHERE q.id = OLD.question_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      SELECT q.bank_id INTO v_new_bank
      FROM public.questions q WHERE q.id = NEW.question_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'guard_exam_bank_question: tabel tidak didukung: %', TG_TABLE_NAME;
  END IF;

  -- Lindungi kedua bank ketika soal atau kunci dipindahkan pada UPDATE.
  IF v_old_bank IS NOT NULL AND NOT public.is_bank_editable(v_old_bank) THEN
    RAISE EXCEPTION 'Bank soal terkunci karena dipakai ujian yang sudah diterbitkan atau memiliki pengerjaan';
  END IF;
  IF v_new_bank IS NOT NULL AND NOT public.is_bank_editable(v_new_bank) THEN
    RAISE EXCEPTION 'Bank soal terkunci karena dipakai ujian yang sudah diterbitkan atau memiliki pengerjaan';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Pemeriksaan setelah migrasi (opsional):
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
-- WHERE tgname IN ('guard_exam_questions', 'guard_exam_keys') AND NOT tgisinternal;
