import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const sentinel='CBTPLUS_INSTANT_SUPERVISOR_V187';
function change(rel,changes){
  const file=path.join(root,rel);
  if(!fs.existsSync(file))throw Error(`${rel} tidak ada.`);
  let original=fs.readFileSync(file,'utf8');
  if(original.includes(sentinel)){console.log(`SUDAH TERPASANG ${rel}`);return;}
  let result=original;
  for(const [needle,replacement,desc] of changes){
    const hits=result.split(needle).length-1;
    if(hits!==1)throw Error(`${rel}: anchor '${desc}' harus 1, ditemukan ${hits}. File belum diubah.`);
    result=result.replace(needle,replacement);
  }
  const bak=file+'.before-v187.bak';
  if(!fs.existsSync(bak))fs.copyFileSync(file,bak);
  fs.writeFileSync(file,result);
  console.log(`OK ${rel} (backup ${path.basename(bak)})`);
}

change('supabase/functions/token-center/index.ts',[
  [".select('id,subject_id,class_id,starts_at,ends_at,status')", ".select('id,subject_id,class_id,bank_id,starts_at,ends_at,status')",'schedule bank_id'],
  ["  const override=checkDb(await adminDb.from('cbt_room_override_tokens').select('ciphertext,rotated_at')",
`  // ${sentinel}: reveal only respondent URLs for PUBLISHED schedules in THIS room.
  const bankIds=[...new Set(scheduleRows.map((s:{bank_id:string|null})=>s.bank_id).filter((x):x is string=>!!x))];
  const banks=bankIds.length?checkDb(await adminDb.from('question_banks')
    .select('id,delivery_mode,form_url').in('id',bankIds)):[];
  const extRows=scheduleIds.length&&ids.length?checkDb(await adminDb.from('cbt_instant_supervisor_status')
    .select('schedule_id,student_id,status,updated_at')
    .in('schedule_id',scheduleIds).in('student_id',ids)
    .eq('period_id',scope.period_id).eq('room_id',scope.room_id)):[];
  const override=checkDb(await adminDb.from('cbt_room_override_tokens').select('ciphertext,rotated_at')`,'instant rows'],
  ["      token:vaultMap.has(s.id)?await unseal(vaultMap.get(s.id)!):null,",
`      token:vaultMap.has(s.id)?await unseal(vaultMap.get(s.id)!):null,
      delivery_mode:banks.find((b:{id:string})=>b.id===(s as {bank_id?:string}).bank_id)?.delivery_mode||'internal',
      form_url:banks.find((b:{id:string})=>b.id===(s as {bank_id?:string}).bank_id)?.form_url||null,`,'mode schedule'],
  ["    }))),pupils,attempts,",
`    }))),pupils,attempts,instant_statuses:extRows,`,'status response'],
  ["    if(op==='supervisor_rotate') {",
`    if(op==='supervisor_instant_mark') {
      const session=required(input.session,'Sesi pengawas');
      const schedule=required(input.schedule_id,'Jadwal');
      const student=required(input.student_id,'Siswa');
      const status=required(input.status,'Status');
      return reply(checkDb(await adminDb.rpc('cbt_v187_mark_instant',{
        p_session:session,p_schedule:schedule,p_student:student,p_status:status
      })));
    }
    if(op==='supervisor_rotate') {`,'operation'],
]);

change('src/SupervisorDashboard.tsx',[
  ["type Schedule={id:string;class_id:string;class_name:string;subject_name:string;token:string|null;starts_at:string;ends_at:string;student_count:number};",
`// ${sentinel}
type Schedule={id:string;class_id:string;class_name:string;subject_name:string;token:string|null;starts_at:string;ends_at:string;student_count:number;delivery_mode?:'internal'|'instant_form';form_url?:string|null};
type ExternalStatus={schedule_id:string;student_id:string;status:'diarahkan'|'selesai_dilaporkan';updated_at:string};`,'schedule type'],
  ["attempts:Attempt[];override_token:string|null;", "attempts:Attempt[];instant_statuses?:ExternalStatus[];override_token:string|null;",'overview type'],
  ["  function logout(){sessionStorage.removeItem('cbtplus-supervisor');",
`  async function markInstant(schedule_id:string,student_id:string,status:'diarahkan'|'selesai_dilaporkan'|'reset'){
    if(status==='selesai_dilaporkan'&&!window.confirm('Tandai sudah selesai berdasarkan konfirmasi pengawas? Ini BUKAN verifikasi respons Google Forms.'))return;
    setBusy(true);setError('');
    try{await action('supervisor_instant_mark',{session,schedule_id,student_id,status});await refresh()}
    catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  function logout(){sessionStorage.removeItem('cbtplus-supervisor');`,'mark function'],
  ["          <strong>Kelas {s.class_name}</strong><h3>{s.subject_name}</h3>",
`          <strong>Kelas {s.class_name}</strong><h3>{s.subject_name}</h3>
          {s.delivery_mode==='instant_form'&&<p><b>Google Form · Mode Instan</b>{s.form_url&&<> · <a href={s.form_url} target="_blank" rel="noopener noreferrer">Buka formulir responden</a> <button type="button" className="outlinebutton" onClick={()=>void navigator.clipboard?.writeText(s.form_url!)}>Salin tautan</button></>}</p>}`,'form url'],
  ["<td>{a?.status||'belum_mulai'}</td>\n                <td>{a?.status==='mengerjakan'?",
`<td>{s.delivery_mode==='instant_form'?(data.instant_statuses?.find(x=>x.student_id===p.id&&x.schedule_id===s.id)?.status||'Belum diarahkan'):(a?.status||'belum_mulai')}</td>
                <td>{s.delivery_mode==='instant_form'?<div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  <button type="button" className="outlinebutton" disabled={busy} onClick={()=>void markInstant(s.id,p.id,'diarahkan')}>Sudah diarahkan</button>
                  <button type="button" className="outlinebutton" disabled={busy} onClick={()=>void markInstant(s.id,p.id,'selesai_dilaporkan')}>Konfirmasi selesai</button>
                  <button type="button" className="outlinebutton" disabled={busy} onClick={()=>void markInstant(s.id,p.id,'reset')}>Reset</button>
                </div>:a?.status==='mengerjakan'?`,'monitor rows'],
  ["      <section className=\"panel\"><h3>Monitoring Pengerjaan Peserta</h3>",
`      {data.schedules.some(s=>s.delivery_mode==='instant_form')&&<section className="panel"><h3>Pemantauan Mode Instan</h3><p>Status diarahkan dan selesai di sini adalah catatan manual pengawas. <b>CBTPlus belum membaca respons, nilai, atau bukti submit dari Google Forms.</b> Periksa tab Respons Google Forms sebelum menyatakan nilai/kehadiran final. Token CBTPlus tidak membatasi akses langsung ke tautan yang dibagikan.</p></section>}
      <section className="panel"><h3>Monitoring Pengerjaan Peserta</h3>`,'disclaimer'],
]);
console.log('Patch v1.8.7 terpasang. Jalankan npm run build lalu deploy token-center.');
