import fs from 'node:fs';

const target = 'src/App.tsx';
if (!fs.existsSync(target)) {
  throw Error('File src/App.tsx tidak ditemukan. Jalankan dari C:\\Projects\\cbtplus-v1');
}
if (!fs.existsSync('src/TokenCenterAdmin.tsx')) {
  throw Error('src/TokenCenterAdmin.tsx belum tersedia. Salin file dari paket hotfix terlebih dahulu.');
}
let app = fs.readFileSync(target, 'utf8');
const before = app;
function replaceOne(oldText, newText, description) {
  if (app.includes(newText)) return;
  const count = app.split(oldText).length - 1;
  if (count !== 1) throw Error(`Tidak menemukan lokasi yang unik untuk ${description} (${count} ditemukan). Tidak ada file diubah.`);
  app = app.replace(oldText, newText);
}

// Tambahkan komponen token admin.
if (!app.includes("import TokenCenterAdmin from './TokenCenterAdmin';")) {
  app = "import TokenCenterAdmin from './TokenCenterAdmin';\n" + app;
}
// Sesuaikan union tipe tab tanpa menduplikasikan nama tab.
const tabMatch = app.match(/type\s+Tab\s*=\s*([^;]+);/);
if (!tabMatch) throw Error('Deklarasi type Tab tidak ditemukan. Tidak ada file diubah.');
if (!tabMatch[1].includes("'token'")) {
  app = app.replace(tabMatch[0], `type Tab=${tabMatch[1]}|'token';`);
}
// Tambahkan navigasi setelah Jadwal Ujian.
if (!app.includes("['token','Token & Pengawas',ShieldCheck]")) {
  replaceOne(
    "['jadwal','Jadwal Ujian',CalendarDays]",
    "['jadwal','Jadwal Ujian',CalendarDays],['token','Token & Pengawas',ShieldCheck]",
    'menu Token & Pengawas'
  );
}
// Token merupakan menu khusus admin: guru tidak boleh melihatnya.
if (!app.includes("'administrasi','token'")) {
  replaceOne(
    "'ruang','pengaturan','administrasi'",
    "'ruang','pengaturan','administrasi','token'",
    'filter akses menu khusus admin'
  );
}
// Hanya render saat admin sudah terotentikasi.
if (!app.includes("{tab==='token'&&isAdmin&&<TokenCenterAdmin/>}")) {
  replaceOne(
    "{tab==='pengaturan'&&isAdmin&&<SettingsManager",
    "{tab==='token'&&isAdmin&&<TokenCenterAdmin/>}\n {tab==='pengaturan'&&isAdmin&&<SettingsManager",
    'halaman pusat token'
  );
}
if (app === before) {
  console.log('Menu Token & Pengawas sudah terpasang, tidak ada perubahan.');
  process.exit(0);
}
const backup = `${target}.before-fix-token-menu.bak`;
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
fs.writeFileSync(target, app);
console.log('Berhasil: menu Token & Pengawas aktif untuk admin. Backup:', backup);
