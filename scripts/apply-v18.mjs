// Idempotent integration: add separate student portal entry via ?portal=siswa without editing App.tsx.
import fs from 'node:fs';import path from 'node:path';
const file=path.resolve('src/main.tsx');
if(!fs.existsSync(file))throw Error('src/main.tsx tidak ditemukan. Jalankan dari root proyek.');
let content=fs.readFileSync(file,'utf8');
if(content.includes("import StudentExam from './StudentExam'")){console.log('Portal siswa sudah terintegrasi.');process.exit(0)}
if(!content.includes("import App from './App';"))throw Error('Struktur main.tsx tidak cocok; belum ada file yang diganti.');
if(!content.includes('<App/>'))throw Error('Render <App/> tidak ditemukan; belum ada file yang diganti.');
content=content.replace("import App from './App';","import App from './App';\nimport StudentExam from './StudentExam';");
content=content.replace('<App/>',"{new URLSearchParams(window.location.search).get('portal')==='siswa'?<StudentExam/>:<App/>}");
fs.copyFileSync(file,file+'.before-v18.bak');fs.writeFileSync(file,content);
console.log('Portal siswa terpasang; cadangan src/main.tsx.before-v18.bak');
