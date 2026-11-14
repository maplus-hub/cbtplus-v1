import fs from 'node:fs';
const appPath='src/App.tsx';
const cssPath='src/style.css';
if(!fs.existsSync(appPath)||!fs.existsSync(cssPath))throw Error('Jalankan perintah di folder proyek CBTPlus (memerlukan src/App.tsx dan src/style.css).');
let app=fs.readFileSync(appPath,'utf8');
let css=fs.readFileSync(cssPath,'utf8');
const marker='/* CBTPLUS_DARK_MODE_V183 */';
if(app.includes('CBTPLUS_DARK_MODE_V183') && css.includes(marker)){
 console.log('Mode gelap v1.8.3 sudah terpasang. Tidak ada perubahan.');process.exit(0);
}
if(app.includes('CBTPLUS_DARK_MODE_V183') !== css.includes(marker)) throw Error('Patch terpasang sebagian. Pulihkan cadangan atau periksa kedua file secara manual.');
const checks=[
 ["export default function App(){",'komponen App'],
 ["return <div className=\"app-shell\"",'dashboard app-shell'],
 ['<div className="topactions">','aksi topbar'],
 ["from 'lucide-react'",'impor lucide-react'],
];
for(const [token,label] of checks)if(!app.includes(token))throw Error(`Struktur ${label} tidak dikenali. Tidak ada file yang diubah.`);
const iconMatch=app.match(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/s);
if(!iconMatch)throw Error('Import icon tidak ditemukan; tidak ada perubahan.');
const icons=iconMatch[1].split(',').map(x=>x.trim());
for(const name of ['Moon','Sun'])if(!icons.includes(name))icons.push(name);
app=app.replace(iconMatch[0],`import {${icons.join(',')}} from 'lucide-react'`);
const stateBlock=`\n // CBTPLUS_DARK_MODE_V183: hanya dashboard admin/guru, disimpan di browser lokal.\n const [darkMode,setDarkMode]=useState<boolean>(()=>{\n  try {return window.localStorage.getItem('cbtplus-admin-theme')==='dark';}\n  catch{return false;}\n });\n useEffect(()=>{\n  document.documentElement.classList.toggle('cbtplus-admin-dark',darkMode);\n  try{window.localStorage.setItem('cbtplus-admin-theme',darkMode?'dark':'light')}catch{/* Storage dapat dinonaktifkan browser */}\n  return ()=>document.documentElement.classList.remove('cbtplus-admin-dark');\n },[darkMode]);\n`;
app=app.replace('export default function App(){','export default function App(){'+stateBlock);
const button=`<button type="button" className="iconbutton theme-toggle" title={darkMode?'Aktifkan mode terang':'Aktifkan mode gelap'} aria-label={darkMode?'Aktifkan mode terang':'Aktifkan mode gelap'} aria-pressed={darkMode} onClick={()=>setDarkMode(v=>!v)}>{darkMode?<Sun size={19}/>:<Moon size={19}/>}</button>`;
app=app.replace('<div className="topactions">','<div className="topactions">'+button);
if(!app.includes('CBTPLUS_DARK_MODE_V183')||!app.includes('theme-toggle'))throw Error('Penyisipan gagal; file tidak ditulis');
const themeCss=fs.readFileSync(new URL('../src/admin-dark-mode.css',import.meta.url),'utf8');
css+='\n\n'+themeCss.trim()+'\n';
// Backup dahulu, lalu tulis berurutan.
for(const [file] of [[appPath],[cssPath]]){
 const backup=file+'.before-v183-darkmode.bak';
 if(!fs.existsSync(backup))fs.copyFileSync(file,backup);
}
fs.writeFileSync(appPath,app);
fs.writeFileSync(cssPath,css);
console.log('Mode gelap v1.8.3 terpasang. Tombol bulan/matahari ada di topbar admin/guru.');
console.log('Cadangan: src/App.tsx.before-v183-darkmode.bak dan src/style.css.before-v183-darkmode.bak');
