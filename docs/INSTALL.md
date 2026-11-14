# CBTPlus v1.8.3 — Mode Gelap Dashboard Admin dan Guru

Paket ini adalah PATCH **tanpa SQL/Supabase**. Ia tidak menimpa modul siswa, penempatan, bank soal, ataupun token.

## Instalasi
1. Ekstrak ZIP.
2. Salin folder `scripts` dan `src` dari ZIP ke akar proyek `C:\Projects\cbtplus-v1` (merge folder, jangan mengganti seluruh direktori).
3. Dari PowerShell:

```powershell
cd C:\Projects\cbtplus-v1
node scripts/apply-v183-darkmode.mjs
npm run build
npm run dev
```

4. Buka halaman admin lokal sesuai URL Vite dan tekan ikon bulan di kanan atas. Tekan matahari untuk kembali ke mode terang.

## Perilaku
- Pilihan tema tersimpan sebagai `localStorage['cbtplus-admin-theme']` pada browser/perangkat itu.
- Tema diaplikasikan hanya selama komponen dashboard admin/guru (`App.tsx`) aktif; komponen portal pengawas dan siswa tidak dimodifikasi.
- Mendukung desktop dan tampilan responsif.
- File backup otomatis: `src/App.tsx.before-v183-darkmode.bak` dan `src/style.css.before-v183-darkmode.bak`. Jangan commit file `.bak`.
- Script dapat dijalankan ulang tanpa menambah tombol/CSS ganda.

## Pengecekan sebelum commit
```powershell
git diff --check
npm run build
git status --short
```

## Batasan
Patch ini menggunakan sejumlah nama class CSS dari CBTPlus sebelumnya. Jika UI telah diubah drastis atau ada komponen dengan gaya inline/warna Tailwind spesifik, sebagian elemen mungkin memerlukan penyesuaian CSS. Script menolak struktur App.tsx yang tidak dikenali alih-alih menimpa file.
