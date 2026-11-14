# CBTPlus v1.7 — Penilaian & Rekap Nilai

## Cakupan paket
- Mesin penskoran SERVER SIDE untuk PG (benar/salah), MCMA (parsial dan penalti), kategori (per pernyataan), dan esai (koreksi guru).
- Ringkasan hasil ujian dan nilai skala 0–100, per jadwal.
- Koreksi esai dengan catatan dan audit perubahan nilai.
- Ekspor rekap ke Excel.
- Pembatasan RPC: admin dapat menilai semua jadwal; guru hanya jadwal yang menggunakan bank soal miliknya. Siswa tidak diberi akses kunci melalui RPC penilaian.
- **Bukan** aplikasi ujian siswa; `exam_attempts` dan `student_answers` harus sudah berisi pengerjaan sebelum hasil bisa tampil.

## Cara instalasi (pastikan v1.6 sudah sukses)
1. Backup proyek dan database Supabase. Gunakan lingkungan pengujian sebelum produksi.
2. Ekstrak ZIP, lalu salin `src/ScoringManager.tsx` ke `C:\Projects\cbtplus-v1\src\`.
3. Salin `scripts/apply-v17.mjs` ke `C:\Projects\cbtplus-v1\scripts\`.
4. Jalankan `node scripts/apply-v17.mjs` **dari root proyek**. Skrip ini menambahkan import, ikon menu, tab dan komponen ke `src/App.tsx`, serta membuat file `src/App.tsx.before-v17.bak`.
5. Salin `sql/008_exam_grading_v17.sql` ke `sql/` proyek. Jalankan isinya sekali di **Supabase → SQL Editor** untuk proyek yang benar.
6. Jalankan `sql/009_test_scoring_v17.sql` di SQL Editor untuk memeriksa logika penskoran. Keluaran sukses: NOTICE 6 skenario lulus.
7. Jalankan `npm run build`, kemudian `npm run dev`.
8. Login sebagai admin/guru → **Penilaian & Nilai** → pilih jadwal dengan bank soal → **Hitung Ulang & Muat Nilai**.
9. Setelah ada pengerjaan siswa (`exam_attempts`), klik **Detail / Koreksi** untuk memeriksa skor dan mengisi nilai esai dari siswa dengan status `selesai`.
10. Uji ekspor Excel dan audit perubahan nilai pada data ujian percobaan.

## Format jawaban siswa (kontrak mesin penilaian)
| Jenis | JSON yang harus tersimpan di `student_answers.answer` |
|---|---|
| PG | `{"correct":"B"}` |
| MCMA | `{"selected":["A","C"]}` |
| Kategori | `{"answers":[true,false,true]}` |
| Esai | `{"text":"Jawaban uraian siswa"}` |

Format kunci jawaban tetap mengikuti v1.6: PG `{"correct":"B"}`, MCMA `{"correct":["A","C"]}`, kategori `{"answers":[true,false,true]}`, esai `{"rubric":"..."}`.

**Catatan:** Paket ini tidak menyediakan cara browser siswa menyimpan jawaban, atau login siswa. Jika nanti format payload aplikasi siswa berbeda, sesuaikan aplikasi siswa atau adapter server sebelum dipakai. Jangan tampilkan tabel `question_keys` di sisi siswa.

## Aturan penilaian (dapat ditinjau pihak sekolah)
- **PG:** cocok dengan kunci memperoleh bobot penuh; selain itu nol.
- **MCMA:** `maksimum(0, pilihan benar yang dipilih / seluruh kunci benar − pilihan salah yang dipilih / seluruh pengecoh) × bobot`, dibulatkan 2 desimal. Pilihan duplikat, format tidak valid dan pilihan di luar opsi dinilai nol.
- **Kategori Benar/Salah:** jumlah pernyataan yang cocok dibagi seluruh pernyataan, kemudian dikalikan bobot.
- **Esai:** skor awal nol; guru dapat memberi angka 0 sampai bobot maksimum **hanya setelah pengerjaan berstatus `selesai`**, lengkap dengan catatan. Semua perubahan skor dan catatan tersimpan pada tabel audit.
- **Nilai 0–100:** `(skor otomatis + nilai esai) / jumlah bobot seluruh soal × 100`, dua desimal; selama ada esai tertunda atau pengerjaan belum selesai, nilainya **sementara**.
- Soal tidak dijawab bernilai nol. Esai dijawab tetapi belum dinilai ditandai pending. Pembulatan per butir maksimal dua desimal.

## Keamanan dan batasan
- Penilaian berjalan di database Supabase menggunakan `SECURITY DEFINER` + pengecekan admin / pemilik bank. Tabel `exam_answer_grades` dan `exam_grade_audit` tidak memiliki policy akses langsung untuk browser.
- Pemeriksaan akses tidak sama dengan pengamanan keseluruhan sistem: integrasikan tes RLS dan uji penetrasi sebelum ujian nyata.
- Script SQL tidak membuat akun siswa, attempt, atau jawaban contoh; database pengguna tidak diisi data uji otomatis.
- Belum ada rekonsiliasi jawaban realtime atau penguncian submission aplikasi siswa; **tahap mesin ujian siswa** harus mencakup autentikasi, persistensi jawaban, dan finalisasi jawaban di backend.
- Penghitungan ulang dilakukan saat memuat hasil/detail. Saat siswa masih mengerjakan, nilai sementara dan bisa berubah.
- Pada bank yang telah dipakai attempt, aturan penguncian v1.6 tetap diberlakukan.
- SQL ini tidak mengubah tabel soal atau menghapus jawaban yang sudah ada; tetapi selalu backup sebelum migrasi.

## Pemeriksaan sebelum commit
```powershell
cd C:\Projects\cbtplus-v1
npm run build
git status
git diff --check
# Pastikan .env, token, kunci service_role dan backup .bak tidak ikut commit.
git add src/App.tsx src/ScoringManager.tsx scripts/apply-v17.mjs sql/008_exam_grading_v17.sql sql/009_test_scoring_v17.sql docs/README_V1_7.md
git diff --cached --check
git diff --cached --stat
# Sesudah tes fungsi + UI pada localhost berhasil:
git commit -m "Add CBTPlus v1.7 scoring and essay grading"
git push origin main
```

**Penting:** Perubahan SQL di Supabase tidak otomatis dideploy lewat GitHub Pages. Penerbitan dashboard dan migrasi database adalah dua proses berbeda.
