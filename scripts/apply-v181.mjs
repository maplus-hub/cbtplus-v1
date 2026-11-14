import fs from 'node:fs';
const appPath='src/App.tsx', mainPath='src/main.tsx';
if(!fs.existsSync(appPath)||!fs.existsSync(mainPath))throw Error('Jalankan dari direktori proyek CBTPlus');
let app=fs.readFileSync(appPath,'utf8'),main=fs.readFileSync(mainPath,'utf8');
if(app.includes("import TokenCenterAdmin from './TokenCenterAdmin';")&&main.includes("import SupervisorDashboard from './SupervisorDashboard';")){
 console.log('Integrasi v1.8.1 sudah ada; tidak ada perubahan');process.exit(0);
}
if(!app.includes("export default function App()")||!app.includes("{tab==='pengaturan'")||!app.includes('const nav:'))throw Error('App.tsx tidak sesuai versi yang didukung. Tidak ada perubahan.');
if(!main.includes("import App from './App';")||!main.includes('<App/>')||!main.includes("import StudentExam from './StudentExam';"))throw Error('main.tsx tidak sesuai struktur yang didukung. Tidak ada perubahan.');
if(!app.includes('TokenCenterAdmin')){
 app=app.replace("import SettingsManager from './SettingsManager';","import TokenCenterAdmin from './TokenCenterAdmin';\nimport SettingsManager from './SettingsManager';");
 app=app.replace(/type Tab=([^;]+);/,(_,choices)=>`type Tab=${choices}|'token';`);
 app=app.replace(/(const nav:[^\n]+)\];/,(_,prefix)=>`${prefix},['token','Token & Pengawas',ShieldCheck]];`);
 app=app.replace("{tab==='pengaturan'", "{tab==='token'&&isAdmin&&<TokenCenterAdmin/>}\n  {tab==='pengaturan'");
 app=app.replace("'pengaturan','administrasi'", "'pengaturan','administrasi','token'");
}
if(!main.includes('SupervisorDashboard')){
 main=main.replace("import App from './App';", "import App from './App';\nimport SupervisorDashboard from './SupervisorDashboard';");
 // Replace <App/> only (student route remains as previous version).
 main=main.replace('<App/>',"(new URLSearchParams(window.location.search).get('portal')==='pengawas'?<SupervisorDashboard/>:<App/>)");
}
fs.copyFileSync(appPath,appPath+'.before-v181.bak');fs.copyFileSync(mainPath,mainPath+'.before-v181.bak');
fs.writeFileSync(appPath,app);fs.writeFileSync(mainPath,main);
console.log('Integrasi v1.8.1 berhasil. Backup tersedia dengan akhiran .before-v181.bak.');
