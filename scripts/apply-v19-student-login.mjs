// CBTPlus v1.9. Does not touch App.tsx, ScheduleManager or admin dashboard.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const mainPath=path.join(root,'src','main.tsx');
const edgePath=path.join(root,'supabase','functions','token-center','index.ts');
const portalPath=path.join(root,'src','StudentNisPortal.tsx');
function assert(v,msg){if(!v)throw new Error(msg)}
assert(fs.existsSync(mainPath),'src/main.tsx tidak ditemukan');
assert(fs.existsSync(edgePath),'Edge Function token-center tidak ditemukan');
assert(fs.existsSync(portalPath),'Salin src/StudentNisPortal.tsx dari ZIP terlebih dahulu');
let main=fs.readFileSync(mainPath,'utf8');
let edge=fs.readFileSync(edgePath,'utf8');
assert(main.includes('StudentExam')||main.includes('StudentNisPortal'),'main.tsx tidak memuat rute siswa dari versi pilot; periksa manual');
assert(edge.includes("if(op==='admin_options')"),'Struktur token-center berbeda; periksa manual sebelum mengubah');
const backup=(file)=>{const target=file+'.before-v19.bak';if(!fs.existsSync(target))fs.copyFileSync(file,target)};
if(!main.includes('StudentNisPortal')){
  main=main.replace(/import\s+StudentExam\s+from\s+['"]\.\/StudentExam['"]\s*;/,"import StudentNisPortal from './StudentNisPortal';");
  assert(main.includes('StudentNisPortal'),'Import StudentExam tidak ditemukan');
  main=main.replace(/<StudentExam\s*\/>/g,'<StudentNisPortal />');
  main=main.replace(/\breturn\s+<StudentExam\s*\/>/g,'return <StudentNisPortal />');
  assert(main.includes('<StudentNisPortal />')&&!main.includes('<StudentExam />'),'Route siswa belum berhasil diganti');
}
const ops=`    // CBTPlus v1.9 -- student login NIS + lesson token. All DB RPCs require service_role.\n    if(op==='student_login') {\n      const nis=required(input.nis,'NIS'),token=required(input.token,'Token pelajaran').toUpperCase();\n      const device=required(input.device,'Identitas perangkat');\n      return reply(checkDb(await adminDb.rpc('cbt_v19_login',{p_nis:nis,p_token:token,p_device:device})));\n    }\n    if(op==='student_info') {\n      return reply(checkDb(await adminDb.rpc('cbt_v19_verify',{p_session:required(input.session,'Sesi siswa'),p_device:required(input.device,'Perangkat')})));\n    }\n    if(op==='student_logout') {\n      return reply({ok:checkDb(await adminDb.rpc('cbt_v19_logout',{p_session:required(input.session,'Sesi siswa'),p_device:required(input.device,'Perangkat')}))});\n    }\n`;
if(!edge.includes("if(op==='student_login')"))edge=edge.replace("    if(op==='admin_options')",ops+"    if(op==='admin_options')");
backup(mainPath);backup(edgePath);
fs.writeFileSync(mainPath,main);fs.writeFileSync(edgePath,edge);
console.log('CBTPlus v1.9: login NIS+Token tersambung, Edge Function ditambah 3 operasi.');
console.log('Backup tersimpan (*.before-v19.bak), jangan commit backup.');
