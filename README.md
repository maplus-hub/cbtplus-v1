# CBTPlus v1.9.1 — Mode Instan, konfirmasi selesai dan izin keluar

Untuk MA Plus Sunan Giri Salatiga. Prasyarat instalasi: v1.8.7 (SQL 015), v1.9 (SQL 017), Edge Function `token-center` sudah deploy, dan hotfix validasi publikasi Google Form.

## Fitur

- Siswa login NIS + token pelajaran (tetap menggunakan v1.9).
- Klik **Buka Google Form** tercatat sebagai indikasi pembukaan (bukan bukti kirim).
- Siswa klik **Saya sudah kirim — Minta Izin Keluar**.
- Pengawas memeriksa respons Google Forms/Sheets dan menekan **Konfirmasi selesai** untuk siswa sesuai jadwal.
- Pengawas membuat **Token Keluar/Buka Kunci**; siswa memasukkan token tersebut. Server memeriksa status konfirmasi, token ruang, sesi siswa + device, kemudian mencabut sesi siswa.
- Dashboard pengawas memuat pembaruan status dari siswa setiap 10 detik.
- Logout biasa pada Mode Instan ditolak server (tetap mungkin menutup browser/tab; bukan kiosk OS).

## Pemasangan

1. Backup database Supabase serta file lokal. Pastikan repo Git tidak sedang rebase.
2. Ekstrak ZIP dan **salin folder `src`, `sql`, `scripts`, `docs`** ke root proyek `C:\Projects\cbtplus-v1`. Jangan menimpa `App.tsx`.
3. Jalankan SQL `sql/018_instant_student_flow_v191.sql` di Supabase SQL Editor.
4. PowerShell:
   ```powershell
   cd C:\Projects\cbtplus-v1
   node scripts/apply-v191-instant-flow.mjs
   npm run build
   npx supabase functions deploy token-center --no-verify-jwt
   npm run dev
   ```
5. Uji pada jadwal Google Form terbit dengan satu siswa percobaan.

## Uji coba minimal

1. Admin generate token pelajaran dan pengawas.
2. Siswa login NIS + token, buka Form (jangan gunakan jawaban ujian sungguhan untuk pengujian).
3. Siswa klik permintaan izin keluar; status di pengawas berubah `menunggu_izin`.
4. Coba token izin sebelum konfirmasi pengawas: **harus ditolak**.
5. Pengawas memeriksa respons Form, lalu **Konfirmasi selesai**.
6. Pengawas generate token izin. Siswa memasukkan token, sesi berakhir.
7. Coba token lama setelah rotasi: **harus ditolak**.
8. Pastikan data peserta ruang lain tidak terlihat.

## Batasan penting

- **Portal web tidak dapat mencegah tab ditutup, pindah aplikasi, membuka URL Google Form langsung, atau login ulang dengan NIS + token pelajaran bersama.** Itu membutuhkan pembungkus APK/EXE, mode kiosk dan konfigurasi perangkat, plus kebijakan pengawas. Jangan mengklaim browser mode ini sebagai sistem anti-kecurangan.
- **Google Forms tidak memberi bukti submit otomatis**. Status selesai adalah catatan manual pengawas. Jika nilai Form perlu masuk CBTPlus, butuh integrasi Google Forms/Sheets secara terpisah.
- Google Form yang memerlukan akun Google dapat membuka tab / browser sendiri. Penguncian WebView tidak boleh diasumsikan kompatibel; uji pada perangkat yang sebenarnya.
- Rotasi token izin membatalkan token izin lama, bukan token pelajaran. Jangan membagikan token izin secara umum.
- Kunci enkripsi Supabase harus disimpan dalam Secrets, bukan GitHub. Jangan commit `*.bak` dan `.env`.
- Tidak ada APK/EXE final dalam paket ini. Ini adalah pembuktian alur ujian Mode Instan pada portal uji yang akan digunakan sebagai fondasi aplikasi perangkat.
