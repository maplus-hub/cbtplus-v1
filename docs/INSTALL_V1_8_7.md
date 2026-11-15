# Instalasi CBTPlus v1.8.7 — Google Form & Pengawas

## Cakupan
Menampilkan label dan tautan Google Form di dashboard pengawas sesuai **ruang, periode, kelas, dan jadwal terbit**. Pengawas bisa menandai peserta sebagai **diarahkan** atau **selesai_dilaporkan**, atau reset catatan. Status dicatat server-side dan audit.

**Status selesai_dilaporkan bukan bukti submit Google Forms.** Tidak ada pengambilan respons, nilai, atau identitas dari Google Forms; pemeriksaan manual di Google Forms/Sheets tetap diperlukan. Aplikasi siswa native APK/EXE dan kunci keluar belum diintegrasikan.

## Prasyarat
- CBTPlus v1.8.1 (token-center, dashboard pengawas, SQL 011) telah aktif.
- CBTPlus v1.8.6 (SQL 014, bank instan dan jadwal) telah aktif.
- `git status` bersih/tidak dalam rebase/merge; backup DB; cadangkan kode; Secrets Supabase aman.

## Pemasangan
1. Ekstrak ZIP, salin `scripts`, `sql`, `docs` ke akar proyek. **Jangan mengganti** `App.tsx`, `ScheduleManager.tsx`, atau `src/StudentExam.tsx`.
2. Jalankan `sql/015_instant_supervisor_v187.sql` di Supabase SQL Editor.
3. PowerShell:
```powershell
cd C:\Projects\cbtplus-v1
node scripts/apply-v187-instant-supervisor.mjs
npm run build
npx supabase functions deploy token-center --no-verify-jwt
npm run dev
```
4. Buka dashboard pengawas `?portal=pengawas`; login token ruang yang sudah digenerate admin.
5. Pilih tanggal, lihat label Google Form dan link di kartu jadwal, lalu uji status siswa.

## Pengujian
- Bank instan X.1 dan X.2 dengan token per kelas tampil saat siswa kedua kelas ada di ruang.
- Bank instan milik kelas lain/tanggal lain tidak tampil.
- Form dapat dibuka dari kartu pengawas; URL bukan link editor.
- Tandai siswa diarahkan, refresh halaman (status tetap); konfirmasi selesai dan reset.
- Status tidak muncul untuk siswa dari ruang pengawas lain.
- Bank internal tetap menunjukkan status `exam_attempts` dan tombol kunci.
- Rotasi token izin tidak menghapus catatan Google Form.
- Build TypeScript dan deploy Edge Function sukses.

## Batasan keamanan
- RPC `cbt_v187_mark_instant` hanya dapat dipanggil dengan service_role, dan memverifikasi token sesi pengawas, periode, ruang, kelas serta jadwal terbit.
- Sesi pengawas tidak membuktikan bahwa siswa tertentu telah benar-benar mengirim respons Google Form; catatan manual tidak boleh dipakai sebagai bukti submit.
- Link Google Form tidak dibatasi oleh token CBTPlus setelah disalin/dibagikan; gunakan pengaturan dan pengawasan Google Forms.
- Siswa kelak membuka form dari WebView/kiosk yang di-whitelist dalam APK/EXE; kebijakan keamanan platform perlu diuji di perangkat nyata.
- Jangan commit file rahasia `.env*`, token, atau file `.bak`.
