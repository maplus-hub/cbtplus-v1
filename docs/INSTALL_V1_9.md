# CBTPlus v1.9 — Login NIS + Token Pelajaran

## Cakupan
- Portal siswa tanpa email/password.
- Login hanya jika NIS aktif, token cocok, siswa ditempatkan di ruang untuk periode jadwal, jadwal diterbitkan, dan ujian sedang berlangsung atau dalam 15 menit sebelum mulai.
- Akses satu sesi aktif per siswa/jadwal; login ulang membatalkan sesi sebelumnya.
- Sesi acak 32 byte dengan hash SHA-256 di database; identitas perangkat berbasis UUID tersimpan secara lokal dan dibandingkan server.
- Pembatasan login gagal per NIS (6 kali/15 menit).
- Google Form hanya muncul sejak jadwal dimulai dan selama jadwal aktif.

**Batasan pilot:** identitas perangkat berbasis UUID browser bukan pengikatan perangkat keras dan tidak melindungi dari penyamaran menggunakan NIS+token bersama. Butuh pengawasan fisik/QR individual saat ujian resmi. Google Form tetap di luar perlindungan CBTPlus, tidak otomatis tercatat submit. Mesin CBT Internal v1.8 berbasis Supabase Auth belum dimigrasikan ke sesi NIS: halaman hanya mengonfirmasi login, tidak menampilkan soal. APK/EXE dan mekanisme token izin keluar belum diaktifkan dalam patch ini.

## Instalasi
1. Pastikan proyek v1.8.7 dan hotfix token-center telah ada; backup Supabase database.
2. Copy folder `src`, `scripts`, `sql`, `docs` dari ZIP ke `C:\Projects\cbtplus-v1` (merge, bukan replace seluruh folder).
3. Jalankan `sql/017_student_nis_token_v19.sql` melalui Supabase SQL Editor.
4. PowerShell:

```powershell
cd C:\Projects\cbtplus-v1
node scripts/apply-v19-student-login.mjs
npm run build
npx supabase functions deploy token-center --no-verify-jwt
npm run dev
```

5. Di admin, pastikan ada siswa dengan NIS unik, status Aktif dan penempatan ruang di periode ujian yang sesuai. Terbitkan jadwal bank instan untuk kelas siswa dan generate Token Pelajaran.
6. Akses `http://localhost:<PORT>/cbtplus-v1/?portal=siswa`, masukkan NIS dan Token Pelajaran. Jadwal harus aktif sekarang, atau mulai dalam maksimal 15 menit.
7. Verifikasi NIS salah, token salah, kelas salah, dan token lama setelah rotasi ditolak. Verifikasi login kedua pada perangkat lain membatalkan sesi lama.

## Keamanan
- `SUPABASE_SERVICE_ROLE_KEY` hanya ada pada Edge Function, jangan simpan di frontend atau GitHub.
- Jangan menyalin token siswa ke screenshot yang dipublikasikan. Token pelajaran dipakai bersama dan bukan identitas personal.
- Deploy Edge Function dengan `--no-verify-jwt` memerlukan pengecekan operasi internal secara eksplisit. RPC login dibuat service_role-only; admin/guru tetap diverifikasi JWT. Sebelum ujian resmi, tambahkan rate-limit per-IP / WAF dan verifikasi pengawas terhadap identitas siswa.
- Jika Google Forms mengumpulkan identitas, setel pengumpulan NIS dan kontrol pada Google Forms/Sheets secara terpisah.
- Script idempotent, membuat backup `.before-v19.bak`.

## Pengujian
- [ ] Login NIS + Token berhasil untuk jadwal aktif
- [ ] Login tidak meminta email/password
- [ ] NIS salah, token salah, dan kelas salah ditolak
- [ ] Token yang dirotasi admin tidak berlaku untuk login baru
- [ ] Jadwal sebelum waktu mulai tidak membuka URL form
- [ ] URL Google Form muncul setelah waktu mulai
- [ ] Login ulang mencabut sesi lama
- [ ] Logout mengakhiri sesi
- [ ] Dashboard pengawas menampilkan kelas dan token jadwal yang sesuai
- [ ] Build, deploy, dan pemeriksaan lint selesai
