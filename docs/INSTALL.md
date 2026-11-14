# CBTPlus v1.8.5 — Sort & Filter (4 menu)

## Fitur
- **Data Siswa:** cari nama/NIS/NISN, filter kelas/status/ruang (termasuk belum ditempatkan), urut nama/NIS/kelas.
- **Ruang & Penempatan (daftar):** cari siswa/NIS/ruang/kursi; filter kelas dan ruang; urut ruang-kursi, nomor kursi, nama, kelas.
- **Penempatan cepat (checkbox):** filter kelas, ruang saat ini/belum ditempatkan, cari nama/NIS; urut nama atau NIS. Pemilihan checkbox tetap aman saat ganti filter. Urutan penomoran kursi baru konsisten menurut nama A-Z, bukan urutan tabel yang sedang dipilih.
- **Bank Soal:** cari judul/mapel/kelas; filter mata pelajaran dan kelas tujuan; urut judul/mapel. Bank umum (tanpa batas kelas) tetap ditampilkan ketika memilih kelas tertentu.
- **Jadwal:** cari mapel/kelas/bank/status/tanggal yang tampil; filter mapel, kelas, status; urut tanggal/mapel/kelas.
- Menampilkan jumlah data hasil filter dan tombol Reset filter pada daftar utama.
- Filter bekerja pada data yang telah dimuat dari Supabase. Untuk dataset sangat besar, pertimbangkan pemfilteran server-side/pagination; belum termasuk dalam patch ini.

## Pasang
1. Pastikan Git rebase/stash/konflik telah selesai. Buat commit/backup lokal sebelum patch.
2. Ekstrak ZIP ke folder `C:\Projects\cbtplus-v1` dengan menggabungkan folder `src` dan `scripts` (jangan hapus berkas lain).
3. Dari PowerShell pada root proyek jalankan:

```powershell
node scripts/apply-v185-sort-filter.mjs
npm run build
npm run dev
```

4. Periksa menu Siswa, Ruang & Penempatan, Bank Soal, Jadwal.
5. **Tidak perlu migrasi SQL atau deploy Edge Function.**

## Aman untuk v1.8.4
- Skrip melakukan validasi anchor **sebelum menulis berkas**. Jika `App.tsx` atau `ScheduleManager.tsx` terbaru berbeda dari struktur versi yang diuji, patch berhenti tanpa mengubah berkas. Kirim pesan error dan file sumber terkait.
- Membuat cadangan `*.before-v185.bak` di root file yang diubah.
- Idempoten (jika berhasil dipasang sekali, pemasangan ulang tidak menggandakan perubahan).
- Jangan commit file `.bak`, `.env`, `.env.local`, atau kunci rahasia.

## Checklist
1. Cari siswa dan filter status Aktif serta kelas X.1; urut NIS.
2. Filter daftar penempatan ke Ruang 01 dan pilih urut nama; cek kursi sebenarnya tidak berubah.
3. Pada panel checkbox, filter kelas X.1 + Belum Ditempatkan; centang 2 siswa; ganti filter tanpa hilangnya pilihan; simpan dan pastikan kursi otomatis.
4. Bank Matematika kelas X.1 & X.2 muncul bila filter kelas X.1 maupun X.2; tidak muncul bila XI.1 (kecuali bank berlaku semua kelas).
5. Jadwal filter kelas X.1 + status published; sort tanggal terbaru.
6. Coba reset semua filter, lalu toggle mode gelap, dan cek form edit/hapus masih berfungsi.
7. `npm run build` berhasil, baru pertimbangkan commit GitHub.

## Batas pengujian
Skrip pemasangan diuji pada snapshot sumber CBTPlus v1.8.4 yang tersedia dan modul v1.8.2; sintaks TSX diperiksa menggunakan TypeScript transpilation. Build proyek yang benar-benar terbaru di komputer pengguna dan pengujian browser/Supabase harus dilakukan pada lingkungan pengguna.
