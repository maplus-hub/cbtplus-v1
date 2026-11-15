# CBTPlus v1.8.6 — Bank Soal Mode Instan (Google Form)

## Persiapan
1. Pastikan v1.8.4 dan v1.8.5 sudah berjalan dan Git dalam keadaan tidak ada rebase/merge konflik.
2. Backup Supabase. Jalankan `sql/014_instant_form_banks_v186.sql` di SQL Editor. **SQL lebih dulu**, baru aplikasi.
3. Gabungkan folder `scripts`, `sql`, dan `docs` paket ke `C:\Projects\cbtplus-v1`.
4. Jalankan `node scripts/apply-v186-instant-form.mjs` dan `npm run build`, lalu `npm run dev`.
5. Skrip membuat backup `.bak` lokal dan memeriksa anchor kode; tidak menyimpan ke Git.

## Cara menggunakan
- Bank Soal > Buat Bank Soal > **Mode Instan (Google Form)**.
- Isi judul, mata pelajaran, kelas tujuan, dan **tautan Google Form HTTPS**.
- Simpan; tidak perlu memasukkan soal ke QuestionEditor.
- Di menu Jadwal, kaitkan bank yang sama ke masing-masing rombel seperti X.1 dan X.2. Jadwal dan token tetap terpisah per kelas.
- Uji Google Form dalam mode pratinjau dan atur izin akses di Google Forms. Gunakan form yang dapat dibuka perangkat siswa tanpa perlu masuk akun Google jika kebijakan ujian menghendaki.
- Tautan dapat dibuka guru/admin melalui tombol **Buka Form**.

## Pembatasan penting
- Versi ini menambah mode di dashboard admin/guru dan menandai jenis bank di jadwal. **Belum menambahkan pembukaan Google Form dari APK/EXE siswa**, karena alur autentikasi siswa NIS + token dan app lockdown native masih dalam pengerjaan.
- Nilai, waktu pengerjaan, jawaban, serta status submit Google Form **tidak otomatis tersinkron** ke CBTPlus. Gunakan rekap Google Forms/Sheets untuk nilai; integrasi nilai CSV dapat dikembangkan setelahnya.
- Tautan Google Form eksternal tidak otomatis dilindungi token CBTPlus. Orang yang mendapatkan tautan dapat mengaksesnya bila pengaturan Form mengizinkan; gunakan pengaturan Google Forms dan pengawasan.
- Token keluar/pelanggaran native belum bisa mengontrol halaman Google Form eksternal secara penuh.
- Mengubah bank internal yang berisi soal menjadi instan ditolak: buat bank instan baru, sehingga data soal aman.
- Perubahan mode atau URL bank ditolak bila bank sudah diterbitkan atau memiliki pengerjaan. Buat bank baru untuk pergantian setelah publikasi.
- Jangan membagikan tautan **edit** Google Form. Gunakan tautan pengisian untuk responden (form viewform), bukan tautan editor. Pastikan batasan hanya menerima respons dan login Google sesuai kondisi siswa.

## Uji sebelum commit
1. Buat bank instan X.1 dan X.2 dengan link Google Forms valid.
2. Tidak meminta input soal, dan muncul tombol Buka Form.
3. Bank sama bisa dipilih dalam jadwal X.1 dan X.2, tetapi tidak XI.1.
4. Jadwal bisa diterbitkan dan token diatur secara terpisah.
5. Link salah/non-HTTPS ditolak.
6. Bank internal lama tetap memiliki editor soal.
7. Edit dan hapus bank instan sebelum publish.
8. Ganti mode/link pada bank yang sudah published ditolak.
9. `npm run build` berhasil, Dark Mode & Sort Filter tidak berubah.
