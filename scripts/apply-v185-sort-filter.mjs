import fs from 'node:fs';
const appPath='src/App.tsx',schedulePath='src/ScheduleManager.tsx',stylePath='src/style.css',quickPath='src/RoomQuickAssign.tsx';
for(const p of [appPath,schedulePath,stylePath,'src/ListToolbar.tsx','src/list-toolbar.css']) if(!fs.existsSync(p))throw new Error('Berkas tidak ditemukan: '+p+'; jalankan dari root proyek dan salin folder src terlebih dahulu.');
let app=fs.readFileSync(appPath,'utf8'),schedule=fs.readFileSync(schedulePath,'utf8'),style=fs.readFileSync(stylePath,'utf8');
let quick=fs.existsSync(quickPath)?fs.readFileSync(quickPath,'utf8'):null;
const tag='CBTPLUS_SORT_FILTER_V185';
if(app.includes(tag)&&schedule.includes(tag)&&style.includes(tag)&&(!quick||quick.includes(tag))){console.log('v1.8.5 sudah terpasang; tidak diulang.');process.exit(0)}
if([app,schedule,style,quick||''].some(s=>s.includes(tag)))throw new Error('Patch terpasang sebagian. Jangan ulang otomatis; periksa berkas dahulu.');
function one(s,from,to,label){const count=s.split(from).length-1;if(count!==1)throw new Error(`Tidak ada file yang ditulis: penanda ${label} ditemukan ${count} kali (harus 1). Kirim source terbaru untuk menyesuaikan patch.`);return s.replace(from,to)}
function addState(s,anchor,states){return one(s,anchor,states+'\n '+anchor,'state '+anchor.slice(0,45))}

app=one(app,"import ScheduleManager from './ScheduleManager';", "import ScheduleManager from './ScheduleManager';\nimport ListToolbar from './ListToolbar';\nimport './list-toolbar.css'; // "+tag,'import toolbar App');
app=addState(app,"const [newRoomName,setNewRoomName]", `// ${tag}: filter dan sort UI (tidak mengubah data Supabase).
 const [studentClassFilter,setStudentClassFilter]=useState(''),[studentStatusFilter,setStudentStatusFilter]=useState(''),[studentRoomFilter,setStudentRoomFilter]=useState(''),[studentSort,setStudentSort]=useState('nama_asc');
 const [roomListSearch,setRoomListSearch]=useState(''),[roomListClass,setRoomListClass]=useState(''),[roomListRoom,setRoomListRoom]=useState(''),[roomListSort,setRoomListSort]=useState('ruang_kursi');
 const [bankSearch,setBankSearch]=useState(''),[bankSubjectFilter,setBankSubjectFilter]=useState(''),[bankClassFilter,setBankClassFilter]=useState(''),[bankSort,setBankSort]=useState('judul_asc');`);
const filteredAnchor="const filtered=students.filter(s=>[s.nis,s.full_name,classesById[s.class_id]].join(' ').toLowerCase().includes(query.toLowerCase()));";
const filteredReplacement=`const filtered=students.filter(s=>{
  const text=[s.nis,s.nisn||'',s.full_name,classesById[s.class_id]].join(' ').toLocaleLowerCase('id-ID');
  const found=text.includes(query.trim().toLocaleLowerCase('id-ID'));
  const room=assignmentMap.get(s.id)?.room_id||'';
  return found&&(!studentClassFilter||s.class_id===studentClassFilter)&&(!studentStatusFilter||s.status===studentStatusFilter)&&(!studentRoomFilter||(studentRoomFilter==='__none'? !room:room===studentRoomFilter));
 }).sort((a,b)=>studentSort==='nis_asc'?a.nis.localeCompare(b.nis,'id',{numeric:true}):studentSort==='nis_desc'?b.nis.localeCompare(a.nis,'id',{numeric:true}):studentSort==='nama_desc'?b.full_name.localeCompare(a.full_name,'id'):studentSort==='kelas_asc'?(classesById[a.class_id]||'').localeCompare(classesById[b.class_id]||'','id',{numeric:true})||a.full_name.localeCompare(b.full_name,'id'):a.full_name.localeCompare(b.full_name,'id'));
 const roomDisplayRows=assignments.filter(a=>a.period_id===activePeriod?.id).filter(a=>{
  const student=studentsById[a.student_id];const room=rooms.find(r=>r.id===a.room_id);
  const text=[student?.nis,student?.full_name,classesById[student?.class_id||''],room?.name,String(a.seat_number)].join(' ').toLocaleLowerCase('id-ID');
  return text.includes(roomListSearch.trim().toLocaleLowerCase('id-ID'))&&(!roomListClass||student?.class_id===roomListClass)&&(!roomListRoom||a.room_id===roomListRoom);
 }).sort((a,b)=>{const sa=studentsById[a.student_id],sb=studentsById[b.student_id];
  if(roomListSort==='nama_asc')return (sa?.full_name||'').localeCompare(sb?.full_name||'','id');
  if(roomListSort==='nama_desc')return (sb?.full_name||'').localeCompare(sa?.full_name||'','id');
  if(roomListSort==='kelas_asc')return (classesById[sa?.class_id||'']||'').localeCompare(classesById[sb?.class_id||'']||'','id',{numeric:true});
  if(roomListSort==='kursi_asc')return a.seat_number-b.seat_number;
  return (rooms.find(r=>r.id===a.room_id)?.sort_order??0)-(rooms.find(r=>r.id===b.room_id)?.sort_order??0)||a.seat_number-b.seat_number;
 });
 const bankDisplayRows=banks.filter(b=>{
  const subject=subjects.find(s=>s.id===b.subject_id)?.name||'';
  const targetClasses=bankClassTargets[b.id]??(b.class_id?[b.class_id]:[]);
  const text=[b.title,subject,...targetClasses.map(id=>classesById[id]||'')].join(' ').toLocaleLowerCase('id-ID');
  return text.includes(bankSearch.trim().toLocaleLowerCase('id-ID'))&&(!bankSubjectFilter||b.subject_id===bankSubjectFilter)&&(!bankClassFilter||(targetClasses.length===0||targetClasses.includes(bankClassFilter)));
 }).sort((a,b)=>bankSort==='judul_desc'?b.title.localeCompare(a.title,'id'):bankSort==='mapel_asc'?(subjects.find(s=>s.id===a.subject_id)?.name||'').localeCompare(subjects.find(s=>s.id===b.subject_id)?.name||'','id')||a.title.localeCompare(b.title,'id'):a.title.localeCompare(b.title,'id'));`;
app=one(app,filteredAnchor,filteredReplacement,'filtered data siswa');
// Letakkan toolbar tepat di bawah panel head; pencarian lama tetap hidup dan tersinkron dengan toolbar.
app=one(app,'<div className="scrolltable"><table><thead><tr><th>NIS</th><th>Nama lengkap</th>',`<ListToolbar title="Siswa" count={filtered.length} total={students.length} search={query} onSearch={setQuery} sort={studentSort} onSort={setStudentSort} sortOptions={[{value:'nama_asc',label:'Nama A–Z'},{value:'nama_desc',label:'Nama Z–A'},{value:'nis_asc',label:'NIS naik'},{value:'nis_desc',label:'NIS turun'},{value:'kelas_asc',label:'Kelas A–Z'}]} filters={[{label:'Kelas',value:studentClassFilter,onChange:setStudentClassFilter,options:[{value:'',label:'Semua kelas'},...classes.map(c=>({value:c.id,label:c.code}))]},{label:'Status',value:studentStatusFilter,onChange:setStudentStatusFilter,options:[{value:'',label:'Semua status'},...[...new Set(students.map(s=>s.status))].map(status=>({value:status,label:status}))]},{label:'Ruang',value:studentRoomFilter,onChange:setStudentRoomFilter,options:[{value:'',label:'Semua ruang'},{value:'__none',label:'Belum ditempatkan'},...rooms.map(r=>({value:r.id,label:r.name}))]}]}/><div className="scrolltable"><table><thead><tr><th>NIS</th><th>Nama lengkap</th>`,'toolbar siswa');
app=one(app,'<section className="panel"><h3>Daftar Penempatan</h3><div className="scrolltable">',`<section className="panel"><h3>Daftar Penempatan</h3><ListToolbar title="Penempatan ruang" count={roomDisplayRows.length} total={assignments.filter(a=>a.period_id===activePeriod?.id).length} search={roomListSearch} onSearch={setRoomListSearch} sort={roomListSort} onSort={setRoomListSort} sortOptions={[{value:'ruang_kursi',label:'Ruang lalu kursi'},{value:'kursi_asc',label:'Nomor kursi naik'},{value:'nama_asc',label:'Nama A–Z'},{value:'nama_desc',label:'Nama Z–A'},{value:'kelas_asc',label:'Kelas A–Z'}]} filters={[{label:'Kelas',value:roomListClass,onChange:setRoomListClass,options:[{value:'',label:'Semua kelas'},...classes.map(c=>({value:c.id,label:c.code}))]},{label:'Ruang',value:roomListRoom,onChange:setRoomListRoom,options:[{value:'',label:'Semua ruang'},...rooms.map(r=>({value:r.id,label:r.name}))]}]}/><div className="scrolltable">`,'toolbar penempatan');
app=one(app,'{assignments.filter(a=>a.period_id===activePeriod?.id).sort((a,b)=>((rooms.find(r=>r.id===a.room_id)?.sort_order||0)-(rooms.find(r=>r.id===b.room_id)?.sort_order||0))||a.seat_number-b.seat_number).map(a=>', '{roomDisplayRows.map(a=>','rows penempatan');
app=one(app,'<section className="panel"><h3>Daftar bank soal</h3><div className="scrolltable">',`<section className="panel"><h3>Daftar bank soal</h3><ListToolbar title="Bank soal" count={bankDisplayRows.length} total={banks.length} search={bankSearch} onSearch={setBankSearch} sort={bankSort} onSort={setBankSort} sortOptions={[{value:'judul_asc',label:'Judul A–Z'},{value:'judul_desc',label:'Judul Z–A'},{value:'mapel_asc',label:'Mata pelajaran A–Z'}]} filters={[{label:'Mata pelajaran',value:bankSubjectFilter,onChange:setBankSubjectFilter,options:[{value:'',label:'Semua mapel'},...subjects.map(s=>({value:s.id,label:s.name}))]},{label:'Kelas tujuan',value:bankClassFilter,onChange:setBankClassFilter,options:[{value:'',label:'Semua kelas'},...classes.map(c=>({value:c.id,label:c.code}))]}]}/><div className="scrolltable">`,'toolbar bank');
app=one(app,'<tbody>{banks.map(b=><tr key={b.id}>','<tbody>{bankDisplayRows.map(b=><tr key={b.id}>','rows bank');
app=one(app,'{!banks.length&&<tr><td className="empty" colSpan={4}>Belum ada bank soal.</td></tr>}',`{!bankDisplayRows.length&&<tr><td className="empty" colSpan={4}>{banks.length?'Tidak ada bank yang sesuai filter.':'Belum ada bank soal.'}</td></tr>}`,'empty bank');
app=one(app,'{!assignments.some(a=>a.period_id===activePeriod?.id)&&<tr><td className="empty" colSpan={5}>Belum ada penempatan ruang untuk periode ini.</td></tr>}',`{!roomDisplayRows.length&&<tr><td className="empty" colSpan={5}>{assignments.some(a=>a.period_id===activePeriod?.id)?'Tidak ada penempatan sesuai filter.':'Belum ada penempatan ruang untuk periode ini.'}</td></tr>}`,'empty penempatan');

schedule=one(schedule,"import {supabase} from './supabase';", "import {supabase} from './supabase';\nimport ListToolbar from './ListToolbar'; // "+tag,'import jadwal');
schedule=addState(schedule,"const [sessions,setSessions]=useState<Session[]>([]),[busy,setBusy]=useState(false);",`// ${tag}: pencarian, filter, dan urut jadwal.
 const [scheduleSearch,setScheduleSearch]=useState(''),[scheduleSubject,setScheduleSubject]=useState(''),[scheduleClass,setScheduleClass]=useState(''),[scheduleStatus,setScheduleStatus]=useState(''),[scheduleSort,setScheduleSort]=useState('tanggal_asc');`);
schedule=one(schedule,' const rows=sessions.filter(x=>x.status!==\'closed\').length;',` const rows=sessions.filter(x=>x.status!=='closed').length;
 const scheduleDisplayRows=sessions.filter(row=>{
  const text=[subjectName(row.subject_id),className(row.class_id),banks.find(b=>b.id===row.bank_id)?.title||'',row.status,fmt(row.starts_at)].join(' ').toLocaleLowerCase('id-ID');
  return text.includes(scheduleSearch.trim().toLocaleLowerCase('id-ID'))&&(!scheduleSubject||row.subject_id===scheduleSubject)&&(!scheduleClass||row.class_id===scheduleClass)&&(!scheduleStatus||row.status===scheduleStatus);
 }).sort((a,b)=>scheduleSort==='tanggal_desc'?b.starts_at.localeCompare(a.starts_at):scheduleSort==='mapel_asc'?subjectName(a.subject_id).localeCompare(subjectName(b.subject_id),'id')||a.starts_at.localeCompare(b.starts_at):scheduleSort==='kelas_asc'?className(a.class_id).localeCompare(className(b.class_id),'id',{numeric:true})||a.starts_at.localeCompare(b.starts_at):a.starts_at.localeCompare(b.starts_at));`,'computed jadwal');
schedule=one(schedule,' <div className="scrolltable"><table><thead><tr><th>Jadwal WIB</th>',` <ListToolbar title="Jadwal ujian" count={scheduleDisplayRows.length} total={sessions.length} search={scheduleSearch} onSearch={setScheduleSearch} sort={scheduleSort} onSort={setScheduleSort} sortOptions={[{value:'tanggal_asc',label:'Tanggal terawal'},{value:'tanggal_desc',label:'Tanggal terbaru'},{value:'mapel_asc',label:'Mata pelajaran A–Z'},{value:'kelas_asc',label:'Kelas A–Z'}]} filters={[{label:'Mapel',value:scheduleSubject,onChange:setScheduleSubject,options:[{value:'',label:'Semua mapel'},...subjects.map(s=>({value:s.id,label:s.name}))]},{label:'Kelas',value:scheduleClass,onChange:setScheduleClass,options:[{value:'',label:'Semua kelas'},...classes.map(c=>({value:c.id,label:c.code}))]},{label:'Status',value:scheduleStatus,onChange:setScheduleStatus,options:[{value:'',label:'Semua status'},{value:'draft',label:'Draft'},{value:'published',label:'Terbit'},{value:'closed',label:'Ditutup'}]}]}/>
 <div className="scrolltable"><table><thead><tr><th>Jadwal WIB</th>`,'toolbar jadwal');
schedule=one(schedule,'{sessions.map(row=><tr key={row.id}>','{scheduleDisplayRows.map(row=><tr key={row.id}>','rows jadwal');
// Hindari pesan tidak ada data saat hasil filter kosong.
schedule=one(schedule,'{!sessions.length&&<tr><td colSpan={5} className="empty">Belum ada jadwal tersimpan. Buat draft menggunakan formulir di atas.</td></tr>}',`{!scheduleDisplayRows.length&&<tr><td colSpan={5} className="empty">{sessions.length?'Tidak ada jadwal sesuai filter.':'Belum ada jadwal tersimpan. Buat draft menggunakan formulir di atas.'}</td></tr>}`,'empty jadwal');
style+='\n/* '+tag+' */\n';
// Tambah sort dan filter ruang pada panel checkbox penempatan cepat, bila modul v1.8.2 tersedia.
if(quick!==null){
 quick=one(quick,"const [busy,setBusy]=useState(false);",`const [busy,setBusy]=useState(false); // ${tag}
 const [quickSort,setQuickSort]=useState('nama_asc'),[assignedRoomFilter,setAssignedRoomFilter]=useState('');`,'state penempatan cepat');
 quick=one(quick,"const visible=useMemo(()=>students.filter(s=>s.status==='Aktif'&&(!classId||s.class_id===classId)&&`${s.nis} ${s.full_name}`.toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>a.full_name.localeCompare(b.full_name,'id')),[students,classId,filter]);",`const visible=useMemo(()=>students.filter(s=>{
  const assigned=byStudent.get(s.id)?.room_id||'';
  return s.status==='Aktif'&&(!classId||s.class_id===classId)&&(!assignedRoomFilter||(assignedRoomFilter==='__none'?!assigned:assigned===assignedRoomFilter))&&\`\${s.nis} \${s.full_name}\`.toLowerCase().includes(filter.toLowerCase());
 }).sort((a,b)=>quickSort==='nama_desc'?b.full_name.localeCompare(a.full_name,'id'):quickSort==='nis_asc'?a.nis.localeCompare(b.nis,'id',{numeric:true}):quickSort==='nis_desc'?b.nis.localeCompare(a.nis,'id',{numeric:true}):a.full_name.localeCompare(b.full_name,'id')),[students,classId,filter,assignedRoomFilter,quickSort,byStudent]);`,'data penempatan cepat');
 quick=one(quick,'   <label>Cari nama / NIS<input',`   <label>Ruang saat ini<select value={assignedRoomFilter} onChange={e=>setAssignedRoomFilter(e.target.value)}><option value="">Semua ruang</option><option value="__none">Belum ditempatkan</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <label>Urutkan<select value={quickSort} onChange={e=>setQuickSort(e.target.value)}><option value="nama_asc">Nama A–Z</option><option value="nama_desc">Nama Z–A</option><option value="nis_asc">NIS naik</option><option value="nis_desc">NIS turun</option></select></label>
   <label>Cari nama / NIS<input`,'toolbar cepat');
 quick=one(quick,"const ordered=visible.filter(s=>selected.includes(s.id)).map(s=>s.id);", "const ordered=students.filter(s=>selected.includes(s.id)).sort((a,b)=>a.full_name.localeCompare(b.full_name,'id')).map(s=>s.id);",'kursi urutan deterministik');
 quick=one(quick,`  // Add selected students outside the current filter deterministically.
  selected.forEach(id=>{if(!ordered.includes(id))ordered.push(id)});`, "  // Urutan kursi tetap konsisten (nama A-Z), tidak bergantung pada tampilan atau filter.",'komentar penempatan');
}
// Semua penanda harus valid sebelum menulis, agar tidak merusak source lokal.
for(const path of [appPath,schedulePath,stylePath,...(quick===null?[]:[quickPath])]){const backup=path+'.before-v185.bak';if(!fs.existsSync(backup))fs.copyFileSync(path,backup)}
fs.writeFileSync(appPath,app);fs.writeFileSync(schedulePath,schedule);fs.writeFileSync(stylePath,style);if(quick!==null)fs.writeFileSync(quickPath,quick);
console.log('CBTPlus v1.8.5: filter/sort 4 modul berhasil dipasang. Cadangan .before-v185.bak tersedia.');
