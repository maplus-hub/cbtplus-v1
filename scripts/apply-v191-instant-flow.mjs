// CBTPlus v1.9.1. Apply after v1.8.7 + v1.9; backups saved for modified source.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.cwd();
const edgePath=path.join(root,'supabase/functions/token-center/index.ts');
const supPath=path.join(root,'src/SupervisorDashboard.tsx');
const pupilPath=path.join(root,'src/StudentNisPortal.tsx');
const staged=path.join(path.dirname(fileURLToPath(import.meta.url)),'templates/StudentNisPortal.tsx');
const TAG='CBTPLUS_INSTANT_STUDENT_V191';
const assert=(v,m)=>{if(!v)throw Error(m)};
for(const p of [edgePath,supPath,pupilPath,staged])assert(fs.existsSync(p),`File tidak ditemukan: ${p}`);
let edge=fs.readFileSync(edgePath,'utf8');
let sup=fs.readFileSync(supPath,'utf8');
const old=fs.readFileSync(pupilPath,'utf8');
assert(fs.readFileSync(staged,'utf8').includes("studentAction('request_exit')"),'Template StudentNisPortal versi 1.9.1 tidak cocok');
assert(edge.includes("if(op==='student_info')")&&edge.includes("if(op==='supervisor_instant_mark')"),'token-center harus memuat v1.9 dan v1.8.7');
assert(sup.includes('instant_statuses')&&sup.includes('async function markInstant'),'SupervisorDashboard harus memuat v1.8.7');
assert(old.includes('function StudentNisPortal')||old.includes('function StudentNisPortal()'),'Portal siswa v1.9 tidak sesuai');
const replaceOnce=(src,a,b,label)=>{const n=src.split(a).length-1;assert(n===1,`${label}: pola ditemukan ${n} kali, harus tepat sekali`);return src.replace(a,b)};
if(!edge.includes(TAG)){
  const before="    if(op==='student_info') {\n      return reply(checkDb(await adminDb.rpc('cbt_v19_verify',{p_session:required(input.session,'Sesi siswa'),p_device:required(input.device,'Perangkat')})));\n    }";
  const after=`    // ${TAG} -- Student actions are verified server-side with the device-bound session.\n    if(op==='student_instant_action') {\n      const session=required(input.session,'Sesi siswa'),device=required(input.device,'Perangkat');\n      const verb=required(input.action,'Aksi');\n      return reply(checkDb(await adminDb.rpc('cbt_v191_instant_action',{\n        p_session:session,p_device:device,p_action:verb,p_token:input.token||''\n      })));\n    }\n    if(op==='student_info') {\n      const data=checkDb(await adminDb.rpc('cbt_v19_verify',{p_session:required(input.session,'Sesi siswa'),p_device:required(input.device,'Perangkat')})) as Record<string,unknown>;\n      const status=checkDb(await adminDb.from('cbt_instant_student_progress')\n        .select('status,opened_at,requested_at,exited_at')\n        .eq('schedule_id',String(data.schedule_id)).eq('student_id',String(data.student_id)).maybeSingle());\n      const supervisor=checkDb(await adminDb.from('cbt_instant_supervisor_status')\n        .select('status').eq('schedule_id',String(data.schedule_id)).eq('student_id',String(data.student_id)).maybeSingle());\n      return reply({...data,student_progress:status?.status||null,supervisor_status:supervisor?.status||null});\n    }`;
  edge=replaceOnce(edge,before,after,'student_info');
  const logoutBefore="    if(op==='student_logout') {\n      return reply({ok:checkDb(await adminDb.rpc('cbt_v19_logout',{p_session:required(input.session,'Sesi siswa'),p_device:required(input.device,'Perangkat')}))});\n    }";
  const logoutAfter=`    if(op==='student_logout') {\n      const session=required(input.session,'Sesi siswa'),device=required(input.device,'Perangkat');\n      const info=checkDb(await adminDb.rpc('cbt_v19_verify',{p_session:session,p_device:device})) as {delivery_mode:string};\n      if(info.delivery_mode==='instant_form')return reply({error:'Gunakan konfirmasi selesai dan token izin pengawas untuk keluar'},403);\n      return reply({ok:checkDb(await adminDb.rpc('cbt_v19_logout',{p_session:session,p_device:device}))});\n    }`;
  edge=replaceOnce(edge,logoutBefore,logoutAfter,'student_logout');
  const queryNeedle="  const override=checkDb(await adminDb.from('cbt_room_override_tokens').select('ciphertext,rotated_at')";
  const queryReplace=`  const instantProgress=scheduleIds.length&&ids.length?checkDb(await adminDb.from('cbt_instant_student_progress')\n    .select('schedule_id,student_id,status,opened_at,requested_at,exited_at')\n    .in('schedule_id',scheduleIds).in('student_id',ids).eq('room_id',scope.room_id)) : [];\n${queryNeedle}`;
  edge=replaceOnce(edge,queryNeedle,queryReplace,'overview progress');
  edge=replaceOnce(edge,'instant_statuses:extRows,','instant_statuses:extRows,instant_progress:instantProgress,','overview response');
}
if(!sup.includes(TAG)){
  sup=replaceOnce(sup,'type ExternalStatus={',`// ${TAG}\ntype StudentProgress={schedule_id:string;student_id:string;status:'form_dibuka'|'menunggu_izin'|'keluar_diizinkan';opened_at:string|null;requested_at:string|null;exited_at:string|null};\ntype ExternalStatus={`,'types');
  sup=replaceOnce(sup,'instant_statuses?:ExternalStatus[];override_token:', 'instant_statuses?:ExternalStatus[];instant_progress?:StudentProgress[];override_token:','overview type');
  sup=replaceOnce(sup,'  useEffect(()=>{if(session)void refresh(session)},[session,examDate]);',`  useEffect(()=>{if(session)void refresh(session)},[session,examDate]);\n  // Poll dashboard every 10s. Date and room remain scoped by the supervisor session.\n  useEffect(()=>{if(!session)return;const t=window.setInterval(()=>void refresh(session),10000);return()=>window.clearInterval(t)},[session,examDate]);`,'auto refresh');
  sup=replaceOnce(sup,"<td>{s.delivery_mode==='instant_form'?(data.instant_statuses?.find(x=>x.student_id===p.id&&x.schedule_id===s.id)?.status||'Belum diarahkan'):(a?.status||'belum_mulai')}</td>","<td>{s.delivery_mode==='instant_form'?<><div>Pengawas: {data.instant_statuses?.find(x=>x.student_id===p.id&&x.schedule_id===s.id)?.status||'Belum diarahkan'}</div><small>Siswa: {data.instant_progress?.find(x=>x.student_id===p.id&&x.schedule_id===s.id)?.status||'Belum membuka Form'}</small></>:(a?.status||'belum_mulai')}</td>",'monitor status');
  sup=replaceOnce(sup,'<h3>Pemantauan Mode Instan</h3>', '<h3>Pemantauan Mode Instan — pembaruan otomatis setiap 10 detik</h3>','heading');
}
function write(file,output){const original=fs.readFileSync(file,'utf8');if(original===output){console.log('Tidak berubah',path.basename(file));return}const bak=file+'.before-v191.bak';if(!fs.existsSync(bak))fs.copyFileSync(file,bak);fs.writeFileSync(file,output);console.log('Diperbarui',file)}
write(edgePath,edge);write(supPath,sup);write(pupilPath,fs.readFileSync(staged,'utf8'));
console.log('v1.9.1 dipasang. Jalankan SQL 018, npm run build, lalu deploy token-center.');
