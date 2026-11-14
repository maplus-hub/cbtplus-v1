# CBTPlus v1.8.1 — Sistem Token Terpusat & Dashboard Pengawas

Paket patch untuk melanjutkan CBTPlus v1.8 (berbasis Supabase) tanpa mengganti keseluruhan proyek.

## File
- `sql/011_token_center_v181.sql` — token pengawas, sesi, vault token jadwal, token izin, dan audit.
- `supabase/functions/token-center/index.ts` — Edge Function server-side untuk admin dan pengawas.
- `src/TokenCenterAdmin.tsx` — menu Token & Pengawas di admin web.
- `src/SupervisorDashboard.tsx` — dashboard pengawas pilot; komponen disiapkan untuk digunakan di aplikasi Android.
- `scripts/apply-v181.mjs` — integrasi idempoten ke App.tsx dan main.tsx, beserta backup.
- `docs/INSTALL_V1_8_1.md` — **baca sebelum memasang**.

**Perhatian:** pada versi ini APK/EXE native siswa belum dibuat. Akses buka kunci/keluar dari perangkat siswa ditahan hingga autentikasi NIS dan pengikatan sesi perangkat selesai. Jangan menguji ujian resmi menggunakan fitur pilot ini.
