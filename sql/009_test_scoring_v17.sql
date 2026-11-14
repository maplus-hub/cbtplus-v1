-- CBTPlus v1.7 • uji fungsi penskoran murni, tidak mengubah data apa pun.
-- Jalankan lewat Supabase SQL Editor SETELAH 008_exam_grading_v17.sql.
DO $$
DECLARE v numeric;
BEGIN
  v:=public.cbt_v17_score_question('pg','{"correct":"B"}'::jsonb,'{"correct":"B"}'::jsonb,'["1","2","3","4"]'::jsonb,20);
  IF v<>20 THEN RAISE EXCEPTION 'PG benar harus 20, hasil %',v;END IF;
  v:=public.cbt_v17_score_question('pg','{"correct":"C"}'::jsonb,'{"correct":"B"}'::jsonb,'["1","2","3","4"]'::jsonb,20);
  IF v<>0 THEN RAISE EXCEPTION 'PG salah harus 0, hasil %',v;END IF;
  v:=public.cbt_v17_score_question('mcma','{"selected":["A","C"]}'::jsonb,'{"correct":["A","C"]}'::jsonb,'["1","2","3","4"]'::jsonb,10);
  IF v<>10 THEN RAISE EXCEPTION 'MCMA semua benar harus 10, hasil %',v;END IF;
  v:=public.cbt_v17_score_question('mcma','{"selected":["A"]}'::jsonb,'{"correct":["A","C"]}'::jsonb,'["1","2","3","4"]'::jsonb,10);
  IF v<>5 THEN RAISE EXCEPTION 'MCMA satu dari dua harus 5, hasil %',v;END IF;
  v:=public.cbt_v17_score_question('mcma','{"selected":["A","B"]}'::jsonb,'{"correct":["A","C"]}'::jsonb,'["1","2","3","4"]'::jsonb,10);
  IF v<>0 THEN RAISE EXCEPTION 'MCMA salah penalti harus 0, hasil %',v;END IF;
  v:=public.cbt_v17_score_question('kategori','{"answers":[true,true,false,false]}'::jsonb,'{"answers":[true,false,true,false]}'::jsonb,'["1","2","3","4"]'::jsonb,8);
  IF v<>4 THEN RAISE EXCEPTION 'Kategori dua dari empat harus 4, hasil %',v;END IF;
  v:=public.cbt_v17_score_question('esai','{"text":"Jawaban siswa"}'::jsonb,'{"rubric":"Rubrik"}'::jsonb,'[]'::jsonb,8);
  IF v<>0 THEN RAISE EXCEPTION 'Esai tidak boleh otomatis diberi nilai, hasil %',v;END IF;
  RAISE NOTICE 'Semua 6 skenario penskoran CBTPlus v1.7 LULUS.';
END $$;
