import fs from 'node:fs';
const appFile='src/App.tsx',schedFile='src/ScheduleManager.tsx',cssFile='src/style.css';
for(const f of [appFile,schedFile,cssFile]) if(!fs.existsSync(f))throw Error(`File tidak ditemukan: ${f}. Jalankan dari root CBTPlus.`);
let app=fs.readFileSync(appFile,'utf8');
let sched=fs.readFileSync(schedFile,'utf8');
let css=fs.readFileSync(cssFile,'utf8');
const marker='CBTPLUS_MULTICLASS_V184';
if(app.includes(marker)&&sched.includes(marker)&&css.includes(marker)){console.log('Patch v1.8.4 sudah terpasang.');process.exit(0)}
if([app,sched,css].some(t=>t.includes(marker)))throw Error('Patch sebagian terpasang; periksa file sebelum melanjutkan.');
function change(src,oldText,newText,description){
 const at=src.indexOf(oldText);
 if(at<0)throw Error(`Struktur tidak sesuai: ${description}. Tidak ada file diubah. Kirim App.tsx/ScheduleManager.tsx terbaru agar patch disesuaikan.`);
 if(src.indexOf(oldText,at+oldText.length)>=0)throw Error(`Token ganda: ${description}. Tidak ada file diubah.`);
 return src.replace(oldText,newText);
}
// App.tsx: ganti single-class editor menjadi daftar checkbox kelas.
app=change(app,"[newBankClass,setNewBankClass]=useState('');", "[newBankClasses,setNewBankClasses]=useState<string[]>([]);\n const [bankClassTargets,setBankClassTargets]=useState<Record<string,string[]>>({}); // CBTPLUS_MULTICLASS_V184",'state kelas bank');
const originalLoad="setBanks(ba.data||[])}catch(e)";
const newLoad=`setBanks(ba.data||[]);const targets=await supabase.from('bank_class_targets').select('bank_id,class_id');if(targets.error)throw targets.error;const grouped:Record<string,string[]>={};for(const t of targets.data||[]){(grouped[t.bank_id]??=[]).push(t.class_id)}setBankClassTargets(grouped)}catch(e)`;
app=change(app,originalLoad,newLoad,'loadData bank');
const first=app.indexOf(' async function updateBank('),last=app.indexOf(' async function removeBank(',first);
if(first<0||last<first)throw Error('Fungsi updateBank/startEditBank tidak ditemukan');
app=app.slice(0,first)+` // CBTPLUS_MULTICLASS_V184: editor bank multi-kelas.
 async function updateBank(e:React.FormEvent){
  e.preventDefault();if(!supabase||!editingBank||!newBankTitle.trim()||!newBankSubject)return;
  const b=banks.find(x=>x.id===editingBank);if(!b||!(isAdmin||b.owner_id===profile?.id)){flash('Tidak diizinkan mengubah bank soal');return}
  const {error}=await supabase.rpc('save_bank_with_classes',{p_bank_id:editingBank,p_title:newBankTitle.trim(),p_subject_id:newBankSubject,p_class_ids:newBankClasses});
  if(error)flash('Gagal edit bank: '+error.message);else{setEditingBank(null);setNewBankTitle('');setNewBankSubject('');setNewBankClasses([]);flash('Bank soal berhasil diperbarui');await loadData()}
 }
 function startEditBank(bank:Bank){setEditingBank(bank.id);setNewBankTitle(bank.title);setNewBankSubject(bank.subject_id);setNewBankClasses(bankClassTargets[bank.id]??(bank.class_id?[bank.class_id]:[]))}
`+app.slice(last);
const createBegin=app.indexOf(' async function createBank('),createEnd=app.indexOf(' async function changePassword(',createBegin);
if(createBegin<0||createEnd<createBegin)throw Error('Fungsi createBank tidak ditemukan');
app=app.slice(0,createBegin)+` async function createBank(e:React.FormEvent){
  e.preventDefault();if(!supabase||!profile||!newBankSubject||!newBankTitle.trim())return;
  const {error}=await supabase.rpc('save_bank_with_classes',{p_bank_id:null,p_title:newBankTitle.trim(),p_subject_id:newBankSubject,p_class_ids:newBankClasses});
  if(error)flash('Gagal membuat bank: '+error.message);else{flash('Bank soal dibuat. Klik judul bank untuk membuka editor soal.');setNewBankTitle('');setNewBankClasses([]);await loadData()}
 }
`+app.slice(createEnd);
const singleControl=`<label>Kelas<select value={newBankClass} onChange={e=>setNewBankClass(e.target.value)}><option value="">Semua / belum ditentukan</option>{classes.map(c=><option key={c.id} value={c.id}>{c.code}</option>)}</select></label>`;
const multipleControl=`<fieldset className="bank-class-targets"><legend>Kelas tujuan (boleh pilih beberapa)</legend><label className="bank-class-choice"><input type="checkbox" checked={newBankClasses.length===0} onChange={()=>setNewBankClasses([])}/> Semua kelas</label><div className="bank-class-grid">{classes.map(c=><label className="bank-class-choice" key={c.id}><input type="checkbox" checked={newBankClasses.includes(c.id)} onChange={e=>setNewBankClasses(prev=>e.target.checked?[...prev,c.id]:prev.filter(x=>x!==c.id))}/>{c.code}</label>)}</div><small>Pilih X.1 dan X.2 agar satu bank Matematika dipakai kedua kelas. Semua kelas berarti tidak dibatasi.</small></fieldset>`;
app=change(app,singleControl,multipleControl,'pilihan multi kelas');
app=change(app,"setNewBankClass('')}}>Batal Edit", "setNewBankClasses([])}}>Batal Edit",'reset form');
app=change(app,"{classesById[b.class_id||'']||'Semua'}", "{(bankClassTargets[b.id]??(b.class_id?[b.class_id]:[])).map(id=>classesById[id]||'?').join(', ')||'Semua kelas'}",'tampilan kelas pada daftar bank');
if(app.includes('newBankClass')&& !app.includes('newBankClasses'))throw Error('Rujukan state lama ditemukan');
// ScheduleManager: kompatibilitas jadwal mengikuti tabel target bank, bukan hanya class_id.
const stateAnchor=' const compatible=useMemo(()=>banks.filter(b=>b.subject_id===subject&&(!b.class_id||b.class_id===classId)),[banks,subject,classId]);';
const schedulerClasses=` // CBTPLUS_MULTICLASS_V184: daftar rombel valid tiap bank dari Supabase.
 const [bankClassTargets,setBankClassTargets]=useState<Record<string,string[]>>({});
 useEffect(()=>{if(!supabase)return;let canceled=false;supabase.from('bank_class_targets').select('bank_id,class_id').then(({data,error})=>{if(canceled)return;if(error){onNotice('Gagal memuat kelas bank: '+error.message);return}const grouped:Record<string,string[]>={};for(const t of data||[])(grouped[t.bank_id]??=[]).push(t.class_id);setBankClassTargets(grouped)});return()=>{canceled=true}},[supabase,period?.id]);
 const acceptsBank=(b:Bank,subjectId:string,classId:string|null)=>{
  if(b.subject_id!==subjectId)return false;
  const targets=bankClassTargets[b.id]??(b.class_id?[b.class_id]:[]);
  return targets.length===0 || (!!classId&&targets.includes(classId));
 };
 const compatible=useMemo(()=>banks.filter(b=>acceptsBank(b,subject,classId)),[banks,subject,classId,bankClassTargets]);`;
sched=change(sched,stateAnchor,schedulerClasses,'penyaringan pilihan bank pada jadwal');
sched=change(sched,"banks.filter(b=>b.subject_id===editSubject&&(!b.class_id||b.class_id===editClass))", "banks.filter(b=>acceptsBank(b,editSubject,editClass))",'filter edit jadwal');
sched=change(sched,"banks.filter(b=>b.subject_id===row.subject_id&&(!b.class_id||b.class_id===row.class_id))", "banks.filter(b=>acceptsBank(b,row.subject_id,row.class_id))",'filter pilihan bank jadwal');
css+='\n/* CBTPLUS_MULTICLASS_V184 */\n.bank-class-targets{border:1px solid var(--border,#d9e2dc);border-radius:10px;padding:12px;min-width:0;display:grid;gap:9px}.bank-class-targets legend{font-weight:650;padding:0 6px}.bank-class-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px}.bank-class-choice{display:flex!important;flex-direction:row!important;align-items:center;gap:9px!important;cursor:pointer;font-weight:500!important}.bank-class-choice input{width:17px!important;height:17px!important;min-width:17px;accent-color:#138454}.bank-class-targets small{opacity:.75}\n';
// Semua validasi selesai sebelum melakukan penulisan.
for(const f of [appFile,schedFile,cssFile]){const backup=f+'.before-v184.bak';if(!fs.existsSync(backup))fs.copyFileSync(f,backup)}
fs.writeFileSync(appFile,app);fs.writeFileSync(schedFile,sched);fs.writeFileSync(cssFile,css);
console.log('CBTPlus v1.8.4: kelas bank multi-pilihan terpasang (App, ScheduleManager, CSS).');
console.log('Cadangan .before-v184.bak dibuat. Jalankan npm run build.');
