# CBTPlus v1.1 — Dashboard Admin, Guru & Editor Soal

Proyek awal CBTPlus untuk **MA Plus Sunan Giri Salatiga**, mengikuti Juknis ASAS Gasal 2026/2027.

> **Status:** fondasi administrasi yang dapat dikembangkan, **BELUM siap dipakai sebagai aplikasi ujian produksi**. Aplikasi siswa Android/Windows, pengawas Android, koreksi, timer server dan fungsi autosave ujian belum dibuat pada tahap ini.

## Modul yang tersedia

- Login Supabase Auth dan pemeriksaan role admin/guru.
- Dashboard peserta, rombel, ruang dan status penempatan.
- Unduh Excel template sekolah; pratinjau dan validasi impor Excel; penyimpanan data siswa di Supabase.
- 8 ruang awal (17, 23, 23, 17, 23, 20, 20, 24 kursi) dengan kuota total 167.
- Penempatan **acak merata** satu kali untuk seluruh periode melalui RPC SQL.
- Penempatan/perubahan **manual oleh admin** dan audit log di PostgreSQL.
- Pembuatan wadah bank soal dan editor soal PG, MCMA, kategori benar/salah, esai.
- Kunci jawaban terpisah; penyimpanan soal+kunci atomik melalui fungsi SQL yang memverifikasi pemilik bank.
- RLS untuk membedakan akses admin/guru; tabel jawaban/kunci tidak dibuka untuk siswa.

## A. Persyaratan

1. Node.js versi LTS, Git, VS Code, akun Supabase.
2. Untuk deployment: akun GitHub. Repositori sebaiknya **private**.
3. Server pengembangan menjalankan aplikasi di Windows, macOS, atau Linux.

## B. Siapkan database Supabase

1. Login ke https://supabase.com/dashboard dan buat project `cbtplus`.
2. Buka **SQL Editor**, lalu jalankan isi file `sql/001_schema.sql` pada proyek baru. **Kemudian jalankan `sql/002_question_editor.sql`**. Untuk instalasi v1.0 yang sudah berjalan, jalankan **hanya** file 002 (jangan ulang file 001).
3. Buka **Authentication → Users** dan buat pengguna admin dengan email serta password yang kuat melalui dashboard Supabase. Verifikasi email jika diperlukan. **Jangan cantumkan password di SQL atau GitHub**.
4. Dapatkan `id` user yang baru dibuat dari Authentication → Users.
5. Pada SQL Editor, jalankan perintah berikut (ganti UUID dan nama):

```sql
insert into public.profiles (id,full_name,role)
values ('GANTI_UUID_DARI_AUTH_USERS','Administrator CBTPlus','admin');
```

6. Untuk akun guru, buat user di Authentication → Users lalu masukkan profil dengan role `guru` (sebaiknya lewat panel internal admin pada tahap berikutnya).

**Penting:** Jangan membiarkan pengguna membuat sendiri baris role admin. SQL ini tidak mengizinkan browser menulis ke tabel profiles. Pengelolaan role hanya dilakukan oleh administrator proyek pada proses bootstrap awal.

## C. Jalankan dashboard secara lokal

```bash
npm install
cp .env.example .env
```

Pada Windows PowerShell, gunakan `Copy-Item .env.example .env` sebagai pengganti `cp` bila perlu.

Isi `.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=SB_PUBLISHABLE_KEY_ATAU_ANON_KEY
```

Ambil dari menu project Supabase **Settings → API** (tampilan menu bisa berubah). Hanya gunakan **publishable/anon key**, bukan `service_role` atau `secret key`.

```bash
npm run dev
```

Buka URL localhost yang muncul (biasanya http://localhost:5173). Login menggunakan akun admin yang sudah dibuat.

## D. Impor siswa

1. Klik **Data Siswa → Download Template Excel**.
2. Isi sheet `IMPORT_SISWA`. Kolom wajib: `nis`, `nama_lengkap`, `kelas`, `jenis_kelamin`, `status_peserta`. Hapus baris `CONTOH`.
3. Simpan sebagai `.xlsx` dan unggah. Dashboard memvalidasi NIS ganda, kelas, JK, format tanggal.
4. Saat tidak ada kesalahan validasi, tekan **Validasi & Simpan**.

**Perhatian**: impor versi pertama dikirim dalam batch 100; bila jaringan putus pada tengah proses, sebagian batch mungkin sudah masuk. Muat ulang untuk memeriksa NIS, lalu impor ulang hanya yang belum ada. Impor transaksi atomik dan upsert terkontrol disiapkan pada tahap selanjutnya.

## E. Editor soal (baru v1.1)

1. Login sebagai admin/guru; buka **Bank Soal**, buat bank soal, lalu klik judulnya.
2. Pilih bentuk soal **PG**, **MCMA** (bisa lebih dari satu kunci), **kategori benar/salah** (tiap pernyataan satu kunci), atau **esai** (rubrik tertulis).
3. Simpan; pertanyaan dan kunci akan masuk dalam satu transaksi lewat `save_bank_question`.
4. Ubah atau hapus soal melalui daftar di bawah editor. Admin dapat mengedit semuanya, guru hanya bank miliknya.
5. Angka target 20/10/10/5 adalah panduan dari juknis; belum ada validasi yang menghalangi publikasi bank tidak lengkap karena modul publikasi ujian belum tersedia.

**Batasan v1.1:** baru editor teks, belum unggah gambar/audio, persamaan matematika khusus, impor soal Word/Excel, penilaian otomatis, penjadwalan aktif, atau pelaksanaan ujian siswa. `MCMA` dan kategori menyimpan kunci, tetapi **metode penskoran parsial** belum ditetapkan.

## F. Hosting Github Pages

Dashboard memakai Vite statis dan Supabase sebagai backend. Untuk **repositori GitHub public** dengan nama `cbtplus`, build menggunakan:

```bash
GITHUB_PAGES=true npm run build
```

Pada Windows PowerShell:

```powershell
$env:GITHUB_PAGES='true'; npm run build
```

Artefak build berada di `dist`. Gunakan GitHub Actions untuk mengatur environment variables dari repository Actions secrets. Karena repo private dan GitHub Pages bergantung paket/izin akun, **cek ketentuan hosting terlebih dahulu**. Jika ingin tetap privat dan tidak tersedia GitHub Pages, hosting frontend dapat menggunakan Cloudflare Pages atau Vercel tanpa mengubah backend Supabase.

> Jangan mengunggah file `.env`, data identitas siswa, kunci jawaban, atau credentials `service_role` ke repository. Nilai VITE_SUPABASE_ANON_KEY/publishable bersifat public client-side, tetapi keamanan tetap bergantung pada RLS dan Edge Functions.

## G. Struktur proyek

```
cbtplus-v1/
├── public/template-import-siswa.xlsx
├── src/QuestionEditor.tsx
├── sql/002_question_editor.sql
├── src/App.tsx
├── src/style.css
├── src/supabase.ts
├── sql/001_schema.sql
├── docs/ROADMAP.md
├── .env.example
└── package.json
```

## H. Keterbatasan dan pekerjaan berikutnya

- Editor teks PG, MCMA, kategori, dan esai sudah tersedia. Pengunggahan berkas dan impor soal otomatis belum tersedia.
- Belum ada jadwal aktif/token/sesi, aplikasi siswa/pengawas, pengumpulan jawaban, timer server, atau nilai otomatis.
- Belum ada proses mutasi/tukar kursi dalam satu transaksi jika kursi tujuan sedang terisi. Admin harus memilih kursi kosong dahulu.
- Tabel awal untuk attempt dan jawaban masih tertutup dari klien siswa. Endpoint aman untuk siswa dibuat di tahap berikutnya.
- Halaman login mengandalkan Supabase Auth; atur rate limiting, MFA untuk admin, backup dan prosedur pemulihan pada tahap produksi.
- Kalibrasi performa server dan uji beban diperlukan sebelum menjalankan ASAS untuk 167 siswa.

Dibuat sebagai fondasi yang bisa dijalankan serta dilanjutkan menjadi CBT multi-platform.

### Deployment otomatis (file workflow sudah tersedia)

1. Upload isi folder ini ke repo GitHub bernama `cbtplus` lalu aktifkan **Settings → Pages → Source: GitHub Actions**.
2. Buat 2 **Actions secrets**: `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
3. Push ke branch `main`. Workflow `.github/workflows/deploy-pages.yml` akan build dan deploy otomatis jika plan dan pengaturan Pages mendukung.
4. Tambahkan URL GitHub Pages ke Supabase Authentication **URL Configuration → Redirect URLs**.
5. Jika repo memiliki nama lain, ubah `base` di `vite.config.ts` dari `/cbtplus/` ke nama repo yang benar.

**Belum dilakukan di sini:** build dan pengujian koneksi sungguhan ke Supabase. Percobaan `npm install` tertahan di lingkungan ini. Jalankan pengujian pada komputer Anda. Jalankan `npm install && npm run build` di komputer Anda sebelum deployment.

## F. Jadwal & sesi ujian (baru v1.2)

**Migrasi:** Setelah SQL 001 dan 002, buka Supabase SQL Editor dan jalankan `sql/003_exam_scheduling.sql`. Jika meningkatkan dari v1.1, jalankan **hanya** 003.

Buka **Jadwal Ujian** pada dashboard untuk:

1. Membuat jadwal *draft* per rombel, berdasarkan kalender dan mata pelajaran.
2. Memilih bank soal yang sesuai mata pelajaran dan rombel.
3. Menerbitkan jadwal setelah bank soal memiliki minimal satu soal (untuk produksi, periksa kelengkapan jumlah soal sesuai juknis secara manual).
4. Membuat token 8 karakter acak untuk jadwal; token hanya ditampilkan sekali dan disimpan dalam bentuk hash di tabel khusus Supabase.
5. Menutup sesi setelah ujian berakhir. Sesi tertutup tidak bisa diubah lagi.
6. Melihat referensi lengkap waktu ujian tertulis dari halaman 13 juknis tanpa otomatis menerbitkan jadwal yang belum diverifikasi admin.

**Aturan penting:** Jadwal tersimpan per **rombel asal**, bukan per ruang. Ruang siswa tetap selama periode. Dua jadwal aktif untuk rombel sama tidak dapat memiliki jam bertabrakan. Waktu yang diinput adalah WIB dan disimpan UTC sebagai TIMESTAMPTZ. Jangan mengubah jam melalui database tanpa memahami zona waktu.

**Belum tersedia:** login siswa yang terkait tabel `students`, endpoint mengikuti ujian, verifikasi token untuk siswa, pengawas APK, autosave jawaban, timer server, koreksi otomatis, impor soal Word/Excel, dan pemeriksaan lengkap kesiapan 45 soal. **Jangan gunakan untuk ujian resmi.** Untuk tahap berikutnya, token harus divalidasi melalui API server yang juga memeriksa autentikasi peserta, jadwal dan status ujian (tidak membagikan fungsi internal pengecekan token secara langsung).


## Perbaikan pgcrypto (v1.2.1)
File `sql/003_exam_scheduling.sql` sudah diperbaiki: memakai `extensions.crypt`, `extensions.gen_salt`, dan `search_path` yang benar. Jika migrasi sebelumnya gagal, jalankan kembali seluruh isi file 003 ini setelah 001 dan 002 selesai. Tidak perlu hapus database.

## CBTPlus v1.3: Multi-periode ujian dan manajemen guru

**Instalasi di proyek Supabase yang sudah memakai v1.2.1:**

1. Ekstrak paket v1.3 lalu salin konfigurasi `.env` Anda sebelumnya (jangan masukkan `.env` ke Git).
2. Buka Supabase SQL Editor; jalankan **hanya** `sql/004_multi_exam_teachers.sql` (jangan jalankan ulang 001).
3. Dashboard web: jalankan `npm install` dan `npm run dev`.
4. Untuk undangan guru, instal Supabase CLI, login, tautkan project Anda, lalu jalankan:

```powershell
supabase login
supabase link --project-ref PROJECT_REF_ANDA
supabase functions deploy invite-teacher
```

5. Periksa pengaturan **Authentication → Email Templates / SMTP** di Supabase. Fitur invite mengirimkan email aktivasi dan **membutuhkan email provider yang benar-benar dapat mengirim ke guru**. SMTP default Supabase dapat memiliki pembatasan penerima/kuota; untuk produksi konfigurasi SMTP yang sesuai. Tambahkan URL tujuan login yang valid di Authentication URL Configuration, termasuk alamat dashboard saat deployment. Untuk localhost, URL callback/pengalihan juga perlu disiapkan sesuai alur template email.
6. Login sebagai admin → menu **Manajemen Guru** → isi nama dan email → **Buat Akun Guru**. Akun login dan profil `guru` otomatis dibuat. Guru membuka tautan undangan untuk mengaktifkan sesi, lalu buka **Akun Saya** untuk mengatur password (minimal 10 karakter); setelah itu dapat login dengan email dan password tersebut.
7. Login admin → **Pengaturan** → tambah atau edit periode ujian serta aktifkan periode yang akan digunakan. Data periode sebelumnya tidak dihapus. Jadwal, penempatan, dan bank soal lama tetap ada.

**Penting:** fungsi invite harus memverifikasi JWT serta role admin di server. Service role key hanya berada pada environment Edge Function di Supabase, jangan pernah ditulis di `.env` yang berawalan `VITE_`. Jangan matikan pemeriksaan JWT Edge Function. Pendaftaran guru tidak boleh menggunakan `supabase.auth.signUp` langsung dari browser admin karena akan mengubah sesi login dan tidak aman untuk atribusi role.

**Batas implementasi v1.3:** perubahan nama sekolah/app tersimpan sebagai konfigurasi, tetapi teks branding hardcoded di sejumlah layar belum otomatis mengikuti tabel konfigurasi. Durasi default belum terhubung ke formulir jadwal. Belum ada menu nonaktifkan/reset password guru; tersedia pendaftaran dan daftar akun guru terlebih dahulu.
