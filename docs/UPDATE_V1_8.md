# CBTPlus v1.8 — Portal Ujian Siswa (Web Pilot)

## Cakupan
Paket ini menambahkan **portal ujian web siswa** di URL yang sama dengan dashboard, tetapi `?portal=siswa` (contoh: `http://localhost:5173/cbtplus-v1/?portal=siswa`). Dashboard admin/guru dan `App.tsx` **tidak diubah**.

Alur: akun siswa Supabase Auth → dipetakan ke `students.id` → jadwal terbit untuk kelasnya → input token pengawas → soal tanpa kunci → autosave jawaban ke RPC → submit → nilai otomatis v1.7. Hasil nilai dikelola guru/admin di v1.7.

### Batasan yang sengaja dipisah
- **Pilot satu atau beberapa akun siswa**. Pembuatan akun siswa massal, distribusi password individual, reset password, APK/EXE lockdown, dan monitoring pengawas masuk tahap berikutnya.
- Belum ada modus offline. Browser harus terhubung ke Supabase; perubahan yang belum tersimpan dapat hilang bila koneksi putus.
- Timer berdasarkan `exam_schedules.ends_at`, **bukan durasi individu**. Apabila waktu berakhir, jawaban tersimpan disubmit otomatis jika koneksi masih tersedia; jika offline, finalisasi dapat dilakukan setelah tersambung lagi dengan RPC server. Autosave yang melewati batas waktu ditolak.
- Belum ada pengacakan soal, kamera, deteksi pindah tab, anti-cheat maupun pembatasan perangkat. Jangan gunakan sebagai aplikasi pengawas ujian resmi sebelum pengujian keamanan dan beban.
- Skema question prompt/options saat ini berbasis teks. Soal bergambar/HTML tidak masuk cakupan portal ini.
- Skor MCMA parsial dan kategori mengikuti kebijakan v1.7 yang sudah ada.

## 1. Backup dan migrasi
Cadangkan proyek dan database. Buka Supabase → SQL Editor untuk project CBTPlus yang benar dan jalankan `sql/010_student_exam_v18.sql` **sekali** setelah v1.7 (`008_exam_grading_v17.sql`). Migrasi non-destruktif: hanya membuat `student_auth_links` dan RPC siswa. Tidak mengubah nilai atau jawaban sebelumnya. Uji pada proyek staging lebih dahulu bila memungkinkan.

## 2. Pasang source
Dari ZIP ini salin:

- `src/StudentExam.tsx` → `C:\Projects\cbtplus-v1\src\StudentExam.tsx`
- `scripts/apply-v18.mjs` → `C:\Projects\cbtplus-v1\scripts\apply-v18.mjs`
- `sql/010_student_exam_v18.sql` → `C:\Projects\cbtplus-v1\sql\010_student_exam_v18.sql`

Lalu buka PowerShell:

```powershell
cd C:\Projects\cbtplus-v1
node scripts/apply-v18.mjs
npm run build
npm run dev
```

Skrip membuat `src/main.tsx.before-v18.bak` dan menambahkan rute lewat parameter query. Jangan commit file `.bak`.

## 3. Buat AKUN UJI siswa (manual, pilot)

1. Pastikan siswa percobaan sudah ada di `public.students` dengan status `Aktif` dan mempunyai penempatan di `room_assignments` untuk periode terkait.
2. Buka Supabase → Authentication → Users → Add user. Buat **akun baru khusus siswa**, dengan email yang dapat digunakan untuk uji dan password kuat. Gunakan akun uji, jangan mengubah akun admin menjadi siswa.
3. Buka SQL Editor dan jalankan SQL berikut setelah mengganti `EMAIL_AKUN_UJI` dan `NIS_SISWA_UJI`. Jangan gunakan akun admin/guru.

```sql
DO $$
DECLARE v_user uuid;v_student uuid;v_role text;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email='EMAIL_AKUN_UJI';
  SELECT id INTO v_student FROM public.students WHERE nis='NIS_SISWA_UJI';
  IF v_user IS NULL OR v_student IS NULL THEN
    RAISE EXCEPTION 'User Auth atau NIS siswa tidak ditemukan';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id=v_user;
  IF v_role IS NOT NULL AND v_role<>'siswa' THEN
    RAISE EXCEPTION 'Dilarang mengubah role akun admin/guru menjadi siswa';
  END IF;
  INSERT INTO public.profiles(id,full_name,role)
  SELECT v_user,s.full_name,'siswa' FROM public.students s WHERE s.id=v_student
  ON CONFLICT(id) DO UPDATE SET role='siswa';
  INSERT INTO public.student_auth_links(user_id,student_id)
  VALUES(v_user,v_student) ON CONFLICT(user_id) DO UPDATE SET student_id=excluded.student_id;
END $$;
```

Untuk produksi, diperlukan alur provisioning akun siswa yang otomatis, aman, dan bisa diaudit. **Jangan** menyimpan `service_role` key di frontend. `cbt_v18_link_student` RPC tersedia untuk admin jika akun Auth dan profil siswa sudah ada.

## 4. Siapkan jadwal uji
1. Gunakan jadwal uji yang bank soalnya telah siap; hubungkan ke rombel siswa tersebut.
2. Jadwal harus berstatus **published** dan memiliki `bank_id`. Periode siswa perlu memiliki penempatan ruang.
3. Atur token dengan fitur Jadwal Ujian admin (`set_exam_token`). Token 6–32 karakter.
4. Uji selama rentang `starts_at` sampai `ends_at`. Jangan ubah tanggal ujian resmi hanya untuk tes, buat periode/jadwal percobaan sendiri.
5. Akses portal siswa: `http://localhost:5173/cbtplus-v1/?portal=siswa` (sesuaikan alamat `vite.config.ts` dan port Vite lokal). Untuk GitHub Pages setelah commit dan deploy: `https://maplus-hub.github.io/cbtplus-v1/?portal=siswa`.

## 5. Pengujian fungsional dan keamanan
- [ ] Login siswa uji berhasil; akun tanpa pemetaan ditolak RPC.
- [ ] Jadwal yang ditampilkan hanya jadwal published sesuai kelas & penempatan.
- [ ] Token salah ditolak; token benar menerima daftar soal.
- [ ] Tidak ada `question_keys`, rubric, atau penjelasan guru pada respons browser / tab Network.
- [ ] PG, MCMA, kategori, dan esai tersimpan. Refresh/relogin, masukkan token lagi, jawaban muncul kembali.
- [ ] Satu soal dari bank lain ditolak oleh `cbt_v18_save`.
- [ ] Kumpulkan ujian, status `selesai`; jawaban tidak bisa diedit setelah submit.
- [ ] Guru/admin melihat skor PG/MCMA/kategori dan dapat mengoreksi esai di v1.7.
- [ ] Setelah deadline jawaban baru tidak dapat disimpan, hasil yang sudah tersimpan dapat dikumpulkan.
- [ ] Uji koneksi putus, dua perangkat bersamaan, browser refresh, dan jaringan lambat.
- [ ] `npm run build` berhasil tanpa error. Pastikan tidak ada rahasia di perubahan Git.

## 6. Commit (hanya setelah pengujian lulus)

```powershell
cd C:\Projects\cbtplus-v1
npm run build
git status
git add src/StudentExam.tsx src/main.tsx scripts/apply-v18.mjs sql/010_student_exam_v18.sql docs/UPDATE_V1_8.md
git diff --cached --stat
git diff --cached --check
git commit -m "Add CBTPlus v1.8 student exam web pilot"
git push origin main
```

Database Supabase **tidak otomatis dimigrasi lewat GitHub Pages**. Jangan commit file `.env`, `service_role` key, atau kredensial siswa.

## 7. Prioritas setelah pilot
Provisioning akun siswa secara massal + credential slip admin, token & pengawasan ruang, autosave yang lebih tangguh (retry queue dan deteksi online), load test 167 siswa, APK Android / EXE Windows kiosk mode, dan audit keamanan (RLS, RPC, rate limit, brute force, ujian serentak).
