# CBTPlus v1.8.4 — Bank Soal Multi-Kelas

## Hasil
Satu bank soal (beserta soal dan kunci) dapat dipakai beberapa rombel, mis. Matematika X.1 dan X.2. Daftar kelas diisi via checkbox. Jadwal dan token pelajaran **tetap per kelas**. Nilai dan percobaan ujian tetap per siswa.

## Pemasangan
1. **Cadangkan** database Supabase dan proyek lokal. Pastikan persoalan `git pull --rebase` sudah selesai; jangan jalankan patch di tengah konflik Git.
2. Ekstrak arsip dan salin folder `scripts` dan `sql` ke folder proyek, gabungkan (jangan timpa seluruh folder).
3. Supabase SQL Editor: jalankan `sql/013_multi_class_banks_v184.sql` **sekali**, setelah migrasi terdahulu.
4. Jalankan dari PowerShell pada `C:\Projects\cbtplus-v1`:
   ```powershell
   node scripts/apply-v184-multiclass.mjs
   npm run build
   npm run dev
   ```
5. Jika skrip menyatakan struktur tidak sesuai, **tidak ada file yang diubah**. Jangan mengubah App.tsx secara manual; kirim App.tsx dan ScheduleManager.tsx versi terbaru untuk menyesuaikan patch.

## Cara pakai
- Menu **Bank Soal → Buat/Edit** → pilih mata pelajaran Matematika → centang **X.1** dan **X.2** → Simpan.
- Di **Jadwal Ujian**, pilih bank sama untuk jadwal Matematika X.1 dan untuk jadwal Matematika X.2.
- Jadwal tidak digabung: dapat memiliki jam, token, pengawas, dan status masing-masing.
- **Semua kelas** berarti tidak dibatasi ke rombel tertentu. Jangan gunakan untuk bank soal yang seharusnya hanya untuk kelas X.

## Kompatibilitas
- Bank lama berisi `class_id` tertentu otomatis dipertahankan sebagai pilihan satu rombel.
- Bank lama `class_id = NULL` tanpa daftar target berarti semua kelas.
- Bank multi-kelas memakai `class_id = NULL` serta daftar pada `bank_class_targets`.
- Perubahan target ditolak apabila bank sudah digunakan oleh jadwal yang menjadi tidak cocok.
- Migrasi **tidak menghapus** bank, soal, jadwal, nilai, maupun token.

## Pengujian
1. Buat bank Matematika X dengan X.1 dan X.2; pastikan hanya ada satu judul bank.
2. Cek filter pilihan bank pada jadwal X.1 dan X.2; pastikan bank tersedia untuk keduanya.
3. Cek jadwal XI.1 tidak dapat memakai bank Matematika X.
4. Uji menghapus X.2 dari bank yang telah ditautkan ke jadwal X.2: harus ditolak.
5. Uji bank lama satu kelas dan bank semua kelas: tetap seperti sebelum pembaruan.
6. Cek `npm run build`, lalu jalankan ulang fungsi-fungsi penting.

## Keamanan
Hanya admin atau guru pemilik bank yang dapat mengubah kelas tujuan; admin bisa mengedit bank lain. Perubahan diverifikasi dalam transaksi RPC dan ada validasi database saat jadwal disimpan. Hati-hati kalau guru lain dapat memilih bank orang lain: akses edit bank tidak berubah, hanya jadwal memakai bank yang sesuai.

## Catatan Git
Skrip membuat cadangan `*.before-v184.bak`. Jangan sertakan file `.bak`, `.env`, atau secrets dalam commit. Sebelum `git push`, selesaikan dulu konflik/rebase dari pekerjaan sebelumnya.
