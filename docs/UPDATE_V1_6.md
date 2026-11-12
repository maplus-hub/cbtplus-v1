# CBTPlus v1.6 — Bank Soal & Penilaian

## Isi patch
- `src/QuestionEditor.tsx`: integrasi alat tambahan.
- `src/BankTools.tsx`: ekspor template Excel, validasi dan impor Excel atomik (maksimum 200 soal/file), pengaturan bobot per tipe, pemeriksaan kesiapan, pratinjau siswa tanpa kunci.
- `sql/006_bank_tools_v16.sql`: RPC impor/bobot serta pengunci perubahan soal dan kunci untuk bank yang terhubung sesi published/closed atau memiliki exam_attempts.

## Cara pasang
1. Cadangkan proyek. Dari patch, salin **dua file src/** ke folder `C:\Projects\cbtplus-v1\src`.
2. Jalankan SQL `006_bank_tools_v16.sql` di Supabase SQL Editor, setelah migrasi v1.5.
3. Jalankan `npm run build`, lalu `npm run dev`.
4. Buka Bank Soal > pilih bank. Unduh template Excel, ubah dan **hapus baris contoh**, lalu pilih Excel untuk pratinjau validasi.
5. Uji impor bank baru yang tidak dipakai ujian; coba bobot, indikator kelengkapan, dan pratinjau.
6. Jangan commit sampai berhasil build, diuji, dan diperiksa `git diff` serta `.env` tidak ter-stage.

## Format Excel
Sheet `SOAL`: `jenis`, `pertanyaan`, `opsi_A`, `opsi_B`, `opsi_C`, `opsi_D`, `opsi_E`, `kunci`, `bobot`, `pembahasan`, `rubrik`.
- `pg`: 2–5 opsi berurutan; kunci satu huruf (`A`).
- `mcma`: 2–5 opsi; kunci dipisah koma (`A,C`).
- `kategori`: 2–5 pernyataan dalam kolom opsi; kunci `Benar,Salah,Benar`. Untuk 6–10 pernyataan tersedia kolom `pernyataan_6` s.d. `pernyataan_10` bila diperlukan.
- `esai`: kolom `rubrik` wajib; opsi dan kunci dikosongkan.

**Penting:** untuk kategori 6–10 pernyataan, isi `pernyataan_6` s.d. `pernyataan_10` dan gunakan penomoran berurutan. Jika kategori memerlukan lebih dari 5 pernyataan, cukup gunakan kolom `pernyataan_1` ... `pernyataan_10` tanpa mengisi `opsi_A` ... `opsi_E`.

## Batasan fitur
- **Impor Word dan gambar** belum termasuk. Teks dan opsi Excel saja; gambar berkas Word memerlukan mekanisme asset storage serta sanitasi HTML sebelum dimasukkan ke editor. Jangan menyalin gambar sebagai teks.
- **Pratinjau** bersifat lokal/visual, tidak menyimpan jawaban atau token.
- **Bobot** yang diatur adalah maksimum poin setiap butir; aturan penskoran aktual untuk MCMA, kategori, dan esai serta normalisasi ke skala 100 akan dikembangkan pada modul penilaian lanjutan.
- **Kesiapan** memakai komposisi baku 20/10/10/5 sebagai acuan, bukan validasi otomatis mata pelajaran tertentu.
- SQL pengunci soal mengubah perilaku bank yang sudah dipakai sesi terpublikasi. Uji dengan bank dummy; jangan jalankan pada produksi tanpa backup.
