# CBTPlus v1.8.2 — Edit/Hapus Siswa & Checklist Ruang

Fitur:
- Menu Data Siswa: tombol Edit/Hapus per baris. Perubahan NIS, nama, kelas, status dll melalui modal/panel pengeditan.
- Penghapusan siswa diblokir UI bila punya penempatan atau riwayat ujian, dan DB FK tetap berlaku. Gunakan Nonaktif untuk siswa yang sudah mempunyai data ujian.
- Ruang & Penempatan: pilih ruang tujuan, filter kelas dan nama, checklist banyak siswa, centang semua hasil filter.
- Nomor kursi otomatis mengambil nomor TERKECIL yang masih kosong, tanpa mengubah kursi siswa lain.
- Proses massal atomik dalam satu RPC; validasi kapasitas, hak admin, dan larangan mengubah siswa yang sudah mulai ujian.
- Penempatan tetap per periode (semua hari), bukan per jadwal harian.

## Instalasi
1. Backup database dan folder proyek.
2. Salin src/StudentEditPanel.tsx dan src/RoomQuickAssign.tsx ke C:\Projects\cbtplus-v1\src.
3. Salin scripts/apply-v182.mjs ke scripts, dan SQL ke folder sql.
4. Di Supabase SQL Editor jalankan `sql/012_bulk_room_assign_v182.sql`. Ini memodifikasi database produksi; pastikan memilih proyek yang benar.
5. `cd C:\Projects\cbtplus-v1` lalu `node scripts/apply-v182.mjs`.
6. `npm run build`; jika berhasil `npm run dev`. JANGAN commit dulu sebelum pengujian.

## Uji
- Edit nama dan NIS siswa uji; cek perubahan di daftar.
- Coba NIS duplikat dan perhatikan penolakan database.
- Hapus siswa tanpa relasi, lalu cek daftar. Siswa dengan ruang/ujian seharusnya ditolak.
- Pilih satu ruang + 3 siswa, pastikan kursi terisi berurutan dan unik.
- Centang semua hasil filter X.1, simpan lalu cek ruang dan kursi.
- Coba penempatan melebihi kapasitas: semestinya seluruh operasi ditolak.
- Pastikan room_assignments tetap untuk periode yang sama pada seluruh hari.

## Perhatian
- Ini bukan import NIS dari PDF; NIS harus diisi/verifikasi dari sumber resmi.
- SQL hanya mengizinkan pengaturan ruang massal oleh akun Supabase dengan role admin.
- Fitur hapus sengaja konservatif untuk melindungi relasi siswa/hasil ujian.
- Jika `App.tsx` telah disusun berbeda, skrip berhenti tanpa mengubah file dan perlu integrasi manual.
