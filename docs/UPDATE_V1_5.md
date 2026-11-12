# CBTPlus v1.5 — CRUD Guru, Bank Soal, Siswa Manual, Jadwal Juknis

## Untuk proyek yang SUDAH berjalan di GitHub Pages

JANGAN mengganti proyek atau membuat Supabase baru. Sebelum merge, cadangkan `src/App.tsx`, `src/ScheduleManager.tsx`, `src/TeacherManager.tsx`. File paket v1.5 dibangun dari sumber v1.4, termasuk fitur Lupa Password dan Administrasi Ujian.

### Langkah pembaruan

1. Salin `src/App.tsx`, `src/TeacherManager.tsx`, `src/ScheduleManager.tsx` dari patch ke folder `C:\Projects\cbtplus-v1\src`.
2. Salin `sql/005_admin_crud_juknis.sql` ke folder `sql/` lalu jalankan seluruh isinya di **Supabase SQL Editor** pada proyek CBTPlus yang aktif. JANGAN ulang migrasi 001–004.
3. Salin `supabase/functions/manage-teacher/index.ts` ke lokasi yang sama di proyek Anda.
4. Di direktori root proyek, deploy fungsi (harus login dan link CLI ke proyek Supabase):
   ```powershell
   npx supabase functions deploy manage-teacher
   ```
   Jika belum menginstal/menautkan CLI, lihat dokumentasi Supabase CLI. Jangan menggunakan `--no-verify-jwt`.
5. Pastikan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` tetap dikonfigurasi. Jangan menaruh service_role di frontend.
6. Jalankan `npm run build`, lalu `npm run dev` dan uji dari localhost sebelum commit/push.
7. Setelah berhasil, jalankan:
   ```powershell
   git add src/App.tsx src/TeacherManager.tsx src/ScheduleManager.tsx sql/005_admin_crud_juknis.sql supabase/functions/manage-teacher/index.ts
   git commit -m "Add teacher and question bank CRUD, manual students, editable exam schedules"
   git push origin main
   ```

### Fitur

- **Manajemen Guru:** tambah seperti sebelumnya; edit nama melalui fungsi server; hapus akun Auth+profil melalui fungsi server, hanya bila guru tidak punya bank soal. Jika SMTP ditunda, undangan baru masih mengikuti batas email Supabase.
- **Bank Soal:** tambah, edit judul/mapel/rombel, hapus beserta soal yang belum ditautkan jadwal; izin admin atau pemilik bank. Bank yang digunakan jadwal ditolak oleh foreign key.
- **Data Siswa:** tambah satu persatu dengan NIS, NISN, nama, rombel, jenis kelamin, tanggal lahir, status, catatan. Impor Excel tetap ada.
- **Jadwal:** 'Terapkan Juknis' membuat 90 jadwal draft (15 blok waktu × 6 rombel) sesuai juknis ASAS Gasal 2026/2027. Perlu membuatnya dari tombol khusus saat periode tersebut masih kosong; tidak menimpa jadwal existing. Dua mapel kelas X yang bersifat gabungan ditambahkan jika belum ada. Untuk periode ujian lain, gunakan fitur Tambah Jadwal.
- **Edit jadwal:** tanggal, jam WIB, mapel, rombel, bank dan petunjuk saat status `draft`.
- **Hapus jadwal:** hanya draft, setelah konfirmasi. Jadwal published/closed tidak dihapus sembarangan agar rekam ujian aman.

### Pengujian khusus

- Buat guru percobaan, ubah nama, dan pastikan nama berubah. Coba hapus guru **tanpa bank soal** (gunakan akun tes, bukan akun produksi).
- Buat bank soal percobaan, edit judul, lalu hapus. Jika bank sudah dipakai jadwal, operasi harus ditolak.
- Tambah satu siswa manual; coba NIS duplikat dan pastikan ditolak.
- Pilih periode `ASAS Gasal 2026/2027` kosong, lalu klik `Terapkan Juknis`; periksa ada 90 jadwal dengan waktu WIB; hindari klik pada periode yang sudah berisi sesi.
- Edit jadwal draft, uji validasi bentrok, kemudian hapus satu draft percobaan.

### Status validasi

File TSX lolos pemeriksaan sintaks TypeScript (`transpileModule`), tetapi **build lengkap tidak dijalankan** dalam lingkungan pembuatan karena dependensi npm tidak tersedia. Jalankan `npm run build` di komputer Anda, yang memiliki node_modules. Integrasi ke Supabase Anda belum diuji dan tetap harus diverifikasi sebelum dipakai pada ujian resmi.
