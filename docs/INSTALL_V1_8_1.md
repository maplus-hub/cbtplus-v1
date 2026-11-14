# CBTPlus v1.8.1 — Sistem Token Terpusat & Dashboard Pengawas

## Ruang lingkup

- **Admin web**: menerbitkan token login pengawas untuk setiap **periode + ruang** dan token mata pelajaran untuk setiap **jadwal terbit + kelas**.
- **Dashboard pengawas (pilot)**: login memakai token pengawas; menampilkan token-token pelajaran pada kelas-kelas yang ditempatkan di ruangnya **untuk tanggal ujian terpilih (WIB)**; memantau status; mengunci pengerjaan aktif; menerbitkan dan memutar token izin keluar/buka kunci.
- **Siswa**: target akhir **APK Android dan EXE Windows**, bukan browser reguler. Endpoint pembukaan kunci/keluar untuk klien siswa **sengaja belum dibuka** sebelum tersedia sesi siswa berbasis NIS yang terikat perangkat. Portal web v1.8 tetap boleh dipakai untuk pengujian internal.

## Persiapan wajib

1. **Backup database Supabase** terlebih dahulu. Pastikan migrasi 001–010 + hotfix 007 telah terpasang.
2. Jalankan `sql/011_token_center_v181.sql` di Supabase SQL Editor. Jangan jalankan berulang ketika token sedang dipakai.
3. Siapkan kunci AES-256 secara lokal di PowerShell (JANGAN mengunggah kunci ke GitHub):

   ```powershell
   $key = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Fill($key)
   [Convert]::ToBase64String($key)
   ```

   Salin hasil base64 ke tempat penyimpanan sandi aman. Di **Supabase > Edge Functions > Secrets**, tambahkan `CBT_TOKEN_ENCRYPTION_KEY` = hasil base64 tersebut. **Jangan pernah mengganti kunci ini sembarangan**: token pelajaran/izin lama tidak dapat didekripsi jika kunci berubah.
4. Deploy dengan perintah dari root proyek:

   ```powershell
   npx supabase functions deploy token-center --no-verify-jwt
   ```

   Flag `--no-verify-jwt` dibutuhkan agar pengawas dapat menukar token login dengan sesi khusus tanpa akun Supabase Auth. **Edge Function tetap melakukan pemeriksaan admin JWT, token pengawas, pembatasan ruang, dan sesi server-side.** Jangan mengaktifkan akses tabel token langsung ke `anon`.
5. Salin `src/TokenCenterAdmin.tsx`, `src/SupervisorDashboard.tsx`, dan `scripts/apply-v181.mjs` ke folder proyek yang sesuai.
6. Jalankan:

   ```powershell
   node scripts/apply-v181.mjs
   npm run build
   npm run dev
   ```

   Integrasi membuat backup `App.tsx.before-v181.bak` dan `main.tsx.before-v181.bak`. Pastikan `src/main.tsx` sebelumnya sudah memiliki rute `?portal=siswa` v1.8.

## Pengujian lokal

1. Admin: buka dashboard lalu menu **Token & Pengawas**.
2. Pilih periode dan Ruang 01, buat token login pengawas. **Catat token** yang ditampilkan.
3. Pilih jadwal kelas X.1 berstatus **published**, buat token pelajaran. Ulangi untuk XI.2 (atau kelas lain yang memang ditempatkan pada ruang yang sama). Perhatikan satu kelas+jadwal berarti satu token, tak peduli ruangnya.
4. Buka `http://localhost:5173/cbtplus-v1/?portal=pengawas` (sesuaikan port Vite), masukkan token login pengawas. Sesuaikan **tanggal ujian** ke jadwal uji.
5. Pastikan dua token untuk dua kelas tampil, tetapi kelas dari ruang lain tidak tampil. Bila jadwal lama dibuat dengan `set_exam_token` versi terdahulu, terbitkan ulang di menu Token & Pengawas agar token dapat ditampilkan (vault baru).
6. Pengawas membuat token keluar/buka kunci dan memutarnya. Salinan lama tidak boleh berlaku lagi.
7. Jika ada pengerjaan `mengerjakan`, uji tombol **Kunci** pada **data siswa simulasi**, bukan data asli.
8. Jangan menguji `student_override` sebelum autentikasi siswa APK/EXE dibangun. API memblokir operasi itu secara sengaja.
9. Periksa tabel `cbt_supervisor_audit` lewat Supabase SQL Editor (bukan browser siswa), dan jalankan `npm run build`.

## Batasan dan keamanan

- Login pengawas menggunakan **token yang panjang dan acak**, unik untuk periode+ruang. Ini token autentikasi. Membaginya ke orang lain berarti memberikan akses ruang tersebut. Identitas individu pengawas belum dapat diaudit jika satu token dibagikan bersama; produksi perlu token per pengawas atau PIN identitas tambahan.
- Token pelajaran adalah token bersama untuk kelas/jadwal, **bukan identitas siswa**. Rancangan login siswa **NIS + token bersama** membutuhkan autentikasi sesi siswa terikat perangkat dan verifikasi identitas tambahan. Jangan gunakan pada ujian resmi sebelum selesai.
- Token izin pengawas tidak akan membatalkan kewajiban **submit**: jalur `exit` pada database hanya sah bila status sudah `selesai`.
- Penguncian di browser tidak dapat mengontrol sistem operasi. Kiosk/lockdown akan dikembangkan di APK pengawas/siswa dan EXE siswa.
- Tampilan dashboard pengawas berbasis React pada paket ini merupakan **pilot fungsional** untuk menguji backend dan akan dipaketkan ke APK; bukan pengganti APK final.
- Fungsi login tidak memiliki rate limiting terdistribusi khusus. Sebelum produksi, tambahkan pembatasan percobaan login di gateway/Edge Function dan monitoring anomali.
- Jangan menyalin **SUPABASE_SERVICE_ROLE_KEY**, `CBT_TOKEN_ENCRYPTION_KEY`, atau token pengguna ke `.env` frontend ataupun GitHub.

## Setelah uji

Commit file sumber, SQL, skrip, dan dokumentasi **setelah** build serta pengujian hak akses berhasil. Deployment Edge Functions dan migrasi SQL adalah langkah Supabase tersendiri, tidak dilakukan oleh GitHub Pages.
