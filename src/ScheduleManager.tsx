import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {CalendarClock,Plus,RefreshCw,ShieldCheck,Trash2,KeyRound,CheckCircle2,Pencil,X} from 'lucide-react';
import {supabase} from './supabase';
import ListToolbar from './ListToolbar'; // CBTPLUS_SORT_FILTER_V185

type Period={id:string;title:string;academic_year:string;start_date:string;end_date:string;is_active:boolean};
type Cls={id:string;code:string;level:number};
type Subject={id:string;name:string};
type Bank={id:string;title:string;subject_id:string;class_id:string|null;owner_id:string};
type Session={id:string;period_id:string;subject_id:string;class_id:string|null;bank_id:string|null;starts_at:string;ends_at:string;status:'draft'|'published'|'closed';instructions:string};
type Props={period:Period|undefined;classes:Cls[];subjects:Subject[];banks:Bank[];isAdmin:boolean;onNotice:(message:string)=>void;onRefresh?:()=>Promise<void>};
const fmt=(iso:string)=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
const localIso=(date:string,time:string)=>new Date(`${date}T${time}:00+07:00`).toISOString();
function readableError(error:unknown){return error instanceof Error?error.message:String(error)}
const juknis=[
 ['2026-11-27','07:30','09:00','Matematika','Semua'],['2026-11-27','09:30','11:00','Seni Teater','Semua'],
 ['2026-11-28','07:30','08:45','Al-Qur’an Hadist','Semua'],['2026-11-28','08:45','10:00','Akidah Akhlak','Semua'],['2026-11-28','10:40','11:55','Fiqih','Semua'],
 ['2026-11-30','08:00','09:30','Bahasa Inggris','Semua'],['2026-11-30','10:15','11:45','Pendidikan Pancasila','Semua'],
 ['2026-12-01','08:00','09:30','Bahasa Arab','Semua'],['2026-12-01','10:15','11:45','Usul Fiqih / Biologi','XI–XII / X'],
 ['2026-12-02','08:00','09:30','Ekonomi / IPS Ekonomi-Sosiologi','XI–XII / X'],['2026-12-02','10:15','11:45','Sejarah / Fisika','XI–XII / X'],
 ['2026-12-03','08:00','09:30','Sosiologi / IPS Sejarah-Geografi','XI–XII / X'],['2026-12-03','10:15','11:45','SKI','Semua'],
 ['2026-12-04','07:30','09:00','Bahasa Indonesia','Semua'],['2026-12-04','09:30','11:00','PJOK','Semua']
];
export default function ScheduleManager({period,classes,subjects,banks,isAdmin,onNotice,onRefresh}:Props){
 // CBTPLUS_SORT_FILTER_V185: pencarian, filter, dan urut jadwal.
 const [scheduleSearch,setScheduleSearch]=useState(''),[scheduleSubject,setScheduleSubject]=useState(''),[scheduleClass,setScheduleClass]=useState(''),[scheduleStatus,setScheduleStatus]=useState(''),[scheduleSort,setScheduleSort]=useState('tanggal_asc');
 const [sessions,setSessions]=useState<Session[]>([]),[busy,setBusy]=useState(false);
 const [subject,setSubject]=useState(''),[classId,setClassId]=useState(''),[bankId,setBankId]=useState('');
 const [date,setDate]=useState('2026-11-27'),[start,setStart]=useState('07:30'),[end,setEnd]=useState('09:00');
 const [instructions,setInstructions]=useState(''),[tokenFor,setTokenFor]=useState(''),[visibleToken,setVisibleToken]=useState('');
 const [showReference,setShowReference]=useState(false);
 const [editing,setEditing]=useState<string|null>(null);
 const [editSubject,setEditSubject]=useState(''),[editClass,setEditClass]=useState(''),[editBank,setEditBank]=useState(''),[editDate,setEditDate]=useState(''),[editStart,setEditStart]=useState(''),[editEnd,setEditEnd]=useState(''),[editInstructions,setEditInstructions]=useState('');
 async function reload(){if(!supabase||!period)return;setBusy(true);const {data,error}=await supabase.from('exam_schedules').select('id,period_id,subject_id,class_id,bank_id,starts_at,ends_at,status,instructions').eq('period_id',period.id).order('starts_at');if(error)onNotice('Gagal memuat jadwal: '+error.message);else setSessions((data||[]) as Session[]);setBusy(false)}
 useEffect(()=>{void reload()},[period?.id]);
 // CBTPLUS_MULTICLASS_V184: daftar rombel valid tiap bank dari Supabase.
 const [bankClassTargets,setBankClassTargets]=useState<Record<string,string[]>>({});
 useEffect(()=>{if(!supabase)return;let canceled=false;supabase.from('bank_class_targets').select('bank_id,class_id').then(({data,error})=>{if(canceled)return;if(error){onNotice('Gagal memuat kelas bank: '+error.message);return}const grouped:Record<string,string[]>={};for(const t of data||[])(grouped[t.bank_id]??=[]).push(t.class_id);setBankClassTargets(grouped)});return()=>{canceled=true}},[supabase,period?.id]);
 const acceptsBank=(b:Bank,subjectId:string,classId:string|null)=>{
  if(b.subject_id!==subjectId)return false;
  const targets=bankClassTargets[b.id]??(b.class_id?[b.class_id]:[]);
  return targets.length===0 || (!!classId&&targets.includes(classId));
 };
 const compatible=useMemo(()=>banks.filter(b=>acceptsBank(b,subject,classId)),[banks,subject,classId,bankClassTargets]);
 const subjectName=(id:string)=>subjects.find(x=>x.id===id)?.name||'-';
 const className=(id:string|null)=>classes.find(x=>x.id===id)?.code||'-';
 async function create(e:FormEvent){e.preventDefault();if(!supabase||!period||!isAdmin)return;
  if(!subject||!classId||!date||!start||!end){onNotice('Lengkapi mapel, rombel, tanggal dan jam');return}
  const starts_at=localIso(date,start),ends_at=localIso(date,end);
  if(new Date(ends_at)<=new Date(starts_at)){onNotice('Jam selesai harus setelah jam mulai');return}
  if(period.start_date && date<period.start_date || period.end_date&&date>period.end_date){onNotice('Tanggal di luar periode ujian');return}
  setBusy(true);const {error}=await supabase.from('exam_schedules').insert({period_id:period.id,subject_id:subject,class_id:classId,bank_id:bankId||null,starts_at,ends_at,instructions,status:'draft'});
  if(error)onNotice('Jadwal gagal dibuat: '+error.message);else{onNotice('Jadwal draft tersimpan untuk rombel '+className(classId));setInstructions('');await reload()}setBusy(false)
 }
 async function update(row:Session,patch:Partial<Session>){if(!supabase||!isAdmin)return;setBusy(true);const {error}=await supabase.from('exam_schedules').update(patch).eq('id',row.id);if(error)onNotice(error.message);else{onNotice('Jadwal diperbarui');await reload()}setBusy(false)}
 async function remove(row:Session){if(!supabase||!isAdmin||row.status!=='draft')return;if(!window.confirm('Hapus jadwal draft ini?'))return;setBusy(true);const {error}=await supabase.from('exam_schedules').delete().eq('id',row.id);if(error)onNotice(error.message);else await reload();setBusy(false)}
 async function setToken(row:Session){if(!supabase||!isAdmin||row.status==='closed')return;
  const token=Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
  setBusy(true);const {error}=await supabase.rpc('set_exam_token',{p_schedule:row.id,p_token:token});setBusy(false);
  if(error)onNotice('Gagal menetapkan token: '+error.message);else{setTokenFor(row.id);setVisibleToken(token);onNotice('Token baru disimpan. Salin sebelum menutup tampilan.')}
 }
 const wibParts=(iso:string)=>{const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));const get=(k:string)=>f.find(v=>v.type===k)?.value||'';return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}};
 function beginEdit(row:Session){const a=wibParts(row.starts_at),b=wibParts(row.ends_at);setEditing(row.id);setEditSubject(row.subject_id);setEditClass(row.class_id||'');setEditBank(row.bank_id||'');setEditDate(a.date);setEditStart(a.time);setEditEnd(b.time);setEditInstructions(row.instructions||'')}
 async function saveEdit(e:FormEvent){e.preventDefault();if(!editing||!supabase||!isAdmin||busy)return;const row=sessions.find(x=>x.id===editing);if(!row||row.status!=='draft'){onNotice('Hanya jadwal draft yang dapat diedit');return}if(!editSubject||!editClass||!editDate||!editStart||!editEnd)return;
  const starts_at=localIso(editDate,editStart),ends_at=localIso(editDate,editEnd);if(ends_at<=starts_at){onNotice('Waktu selesai harus setelah mulai');return}
  if((period?.start_date&&editDate<period.start_date)||(period?.end_date&&editDate>period.end_date)){onNotice('Tanggal di luar periode ujian');return}
  setBusy(true);const {error}=await supabase.from('exam_schedules').update({subject_id:editSubject,class_id:editClass,bank_id:editBank||null,starts_at,ends_at,instructions:editInstructions}).eq('id',editing).eq('status','draft');setBusy(false);
  if(error)onNotice('Gagal mengedit jadwal: '+error.message);else{setEditing(null);onNotice('Jadwal berhasil diedit');await reload()}
 }
 async function importJuknis(){if(!supabase||!period||!isAdmin||busy)return;if(sessions.length){onNotice('Sudah ada jadwal; jangan menimpa periode ini.');return}if(!window.confirm('Isi jadwal aktif dari Juknis ASAS Gasal 2026/2027 untuk semua rombel? Jadwal dibuat sebagai draft.'))return;
 setBusy(true);const {data,error}=await supabase.rpc('seed_juknis_asas_2026',{p_period:period.id});setBusy(false);if(error)onNotice('Gagal memasukkan juknis: '+error.message);else{onNotice(`${data} jadwal per rombel berhasil dibuat dari juknis.`);await reload();await onRefresh?.()}}
 const rows=sessions.filter(x=>x.status!=='closed').length;
 const scheduleDisplayRows=sessions.filter(row=>{
  const text=[subjectName(row.subject_id),className(row.class_id),banks.find(b=>b.id===row.bank_id)?.title||'',row.status,fmt(row.starts_at)].join(' ').toLocaleLowerCase('id-ID');
  return text.includes(scheduleSearch.trim().toLocaleLowerCase('id-ID'))&&(!scheduleSubject||row.subject_id===scheduleSubject)&&(!scheduleClass||row.class_id===scheduleClass)&&(!scheduleStatus||row.status===scheduleStatus);
 }).sort((a,b)=>scheduleSort==='tanggal_desc'?b.starts_at.localeCompare(a.starts_at):scheduleSort==='mapel_asc'?subjectName(a.subject_id).localeCompare(subjectName(b.subject_id),'id')||a.starts_at.localeCompare(b.starts_at):scheduleSort==='kelas_asc'?className(a.class_id).localeCompare(className(b.class_id),'id',{numeric:true})||a.starts_at.localeCompare(b.starts_at):a.starts_at.localeCompare(b.starts_at));
 return <>
 <div className="pageintro"><div><h2>Jadwal & Sesi Ujian</h2><p>Jadwal per rombel, bank soal, status publikasi dan token.</p></div><span className="pill"><CalendarClock size={15}/>{period?.title||'Belum ada periode'}</span></div>
 <div className="schedule-metrics"><div className="panel"><b>{sessions.length}</b><small>Total sesi</small></div><div className="panel"><b>{sessions.filter(x=>x.status==='published').length}</b><small>Dipublikasikan</small></div><div className="panel"><b>{rows}</b><small>Sesi belum ditutup</small></div></div>
 <section className="panel"><div className="panelhead"><div><h3>Tambah jadwal ujian</h3><p>Satu jadwal untuk satu rombel. Kelas campuran di ruang tidak mengubah jadwal berdasarkan kelas asal.</p></div></div>
 <form className="schedule-form" onSubmit={create}>
 <label>Mata pelajaran<select required value={subject} onChange={e=>{setSubject(e.target.value);setBankId('')}}><option value="">Pilih mapel</option>{subjects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
 <label>Rombel<select required value={classId} onChange={e=>{setClassId(e.target.value);setBankId('')}}><option value="">Pilih rombel</option>{classes.map(x=><option key={x.id} value={x.id}>{x.code}</option>)}</select></label>
 <label>Tanggal<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label>Mulai (WIB)<input type="time" required value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label>Selesai (WIB)<input type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <label>Bank soal<select value={bankId} onChange={e=>setBankId(e.target.value)}><option value="">Belum dipilih (draft)</option>{compatible.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
 <label className="schedule-notes">Petunjuk tambahan<input value={instructions} maxLength={350} onChange={e=>setInstructions(e.target.value)} placeholder="Opsional"/></label>
 <button type="submit" disabled={!isAdmin||busy||!period} className="primary"><Plus size={16}/> Simpan Draft</button>
 </form><div className="infobox">Jam diinput dalam WIB (Asia/Jakarta) dan dikonversi ke UTC untuk database. Sesi baru selalu berstatus draft. Publikasi membutuhkan bank soal yang telah berisi soal. Dua sesi untuk rombel yang sama tidak boleh bertabrakan.</div></section>
 <section className="panel"><div className="panelhead"><div><h3>Jadwal saat ini — tersimpan di Supabase</h3><p>Token tidak dapat dibaca ulang. Admin bisa membuat token baru.</p></div><button onClick={()=>void reload()} className="outlinebutton" disabled={busy}><RefreshCw size={15}/> Muat ulang</button></div>
 {editing&&<form className="schedule-form" onSubmit={saveEdit}><h3 className="schedule-notes">Edit Jadwal Draft</h3>
 <label>Mata pelajaran<select required value={editSubject} onChange={e=>{setEditSubject(e.target.value);setEditBank('')}}>{subjects.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label>Rombel<select required value={editClass} onChange={e=>{setEditClass(e.target.value);setEditBank('')}}>{classes.map(v=><option key={v.id} value={v.id}>{v.code}</option>)}</select></label>
 <label>Tanggal<input required type="date" value={editDate} onChange={e=>setEditDate(e.target.value)}/></label>
 <label>Mulai WIB<input required type="time" value={editStart} onChange={e=>setEditStart(e.target.value)}/></label>
 <label>Selesai WIB<input required type="time" value={editEnd} onChange={e=>setEditEnd(e.target.value)}/></label>
 <label>Bank soal<select value={editBank} onChange={e=>setEditBank(e.target.value)}><option value="">Belum dipilih</option>{banks.filter(b=>acceptsBank(b,editSubject,editClass)).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
 <label className="schedule-notes">Petunjuk<input maxLength={350} value={editInstructions} onChange={e=>setEditInstructions(e.target.value)}/></label>
 <button type="submit" className="primary" disabled={busy}>Simpan Perubahan</button><button type="button" className="outlinebutton" onClick={()=>setEditing(null)}><X size={14}/> Batal</button></form>}
 <ListToolbar title="Jadwal ujian" count={scheduleDisplayRows.length} total={sessions.length} search={scheduleSearch} onSearch={setScheduleSearch} sort={scheduleSort} onSort={setScheduleSort} sortOptions={[{value:'tanggal_asc',label:'Tanggal terawal'},{value:'tanggal_desc',label:'Tanggal terbaru'},{value:'mapel_asc',label:'Mata pelajaran A–Z'},{value:'kelas_asc',label:'Kelas A–Z'}]} filters={[{label:'Mapel',value:scheduleSubject,onChange:setScheduleSubject,options:[{value:'',label:'Semua mapel'},...subjects.map(s=>({value:s.id,label:s.name}))]},{label:'Kelas',value:scheduleClass,onChange:setScheduleClass,options:[{value:'',label:'Semua kelas'},...classes.map(c=>({value:c.id,label:c.code}))]},{label:'Status',value:scheduleStatus,onChange:setScheduleStatus,options:[{value:'',label:'Semua status'},{value:'draft',label:'Draft'},{value:'published',label:'Terbit'},{value:'closed',label:'Ditutup'}]}]}/>
 <div className="scrolltable"><table><thead><tr><th>Jadwal WIB</th><th>Mapel / Rombel</th><th>Bank soal</th><th>Status</th><th>Aksi admin</th></tr></thead><tbody>
 {scheduleDisplayRows.map(row=><tr key={row.id}><td>{fmt(row.starts_at)}<br/>s.d. {new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(new Date(row.ends_at))}</td><td><b>{subjectName(row.subject_id)}</b><br/>{className(row.class_id)}</td><td>{banks.find(b=>b.id===row.bank_id)?.title||'Belum dipilih'}</td><td><span className={'tag '+(row.status==='published'?'green':'')}>{row.status}</span></td><td><div className="schedule-actions">{row.status==='draft'&&<>
 <select aria-label="Pilih bank soal" value={row.bank_id||''} onChange={e=>void update(row,{bank_id:e.target.value||null})} disabled={!isAdmin||busy}><option value="">Pilih bank</option>{banks.filter(b=>acceptsBank(b,row.subject_id,row.class_id)).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select>
 <button disabled={!isAdmin||busy||!row.bank_id} className="outlinebutton" onClick={()=>void update(row,{status:'published'})}><CheckCircle2 size={14}/> Terbitkan</button>
 <button disabled={!isAdmin||busy} className="outlinebutton" title="Hapus draft" onClick={()=>void remove(row)}><Trash2 size={14}/></button></>}
 {row.status==='published'&&<button className="outlinebutton" disabled={!isAdmin||busy} onClick={()=>{if(window.confirm('Tutup sesi ini secara permanen?'))void update(row,{status:'closed'})}}><ShieldCheck size={14}/> Tutup sesi</button>}
 {row.status!=='closed'&&<button className="outlinebutton" disabled={!isAdmin||busy} onClick={()=>void setToken(row)}><KeyRound size={14}/> Token baru</button>}
 </div></td></tr>)}
 {!scheduleDisplayRows.length&&<tr><td colSpan={5} className="empty">{sessions.length?'Tidak ada jadwal sesuai filter.':'Belum ada jadwal tersimpan. Buat draft menggunakan formulir di atas.'}</td></tr>}
 </tbody></table></div>
 {visibleToken&&<div className="token-reveal"><b>Token baru untuk jadwal {subjectName(sessions.find(s=>s.id===tokenFor)?.subject_id||'')}:</b><code>{visibleToken}</code><button className="outlinebutton" onClick={()=>{void navigator.clipboard.writeText(visibleToken).then(()=>onNotice('Token tersalin'),()=>onNotice('Salin token secara manual'))}}>Salin token</button><button className="outlinebutton" onClick={()=>{setVisibleToken('');setTokenFor('')}}>Sembunyikan</button><small>Jangan bagikan sebelum sesi ujian. Token baru menggantikan token lama.</small></div>}
 </section>
 <section className="panel"><div className="panelhead"><div><h3>Jadwal dari Juknis ASAS Gasal 2026/2027</h3><p>Terapkan sebagai jadwal aktif periode ini, lalu edit/tambah/hapus sesuai kebutuhan (status awal draft).</p></div><button className="primary" disabled={!isAdmin||busy||!period||sessions.length>0} onClick={()=>void importJuknis()}>Terapkan Juknis</button><button className="outlinebutton" onClick={()=>setShowReference(!showReference)}>{showReference?'Sembunyikan':'Lihat referensi'}</button></div>
 {showReference&&<div className="scrolltable"><table><thead><tr><th>Tanggal</th><th>Jam WIB</th><th>Mapel</th><th>Tingkat</th></tr></thead><tbody>{juknis.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>}
 <div className="infobox">Untuk hari dengan mapel berbeda per tingkat, buat jadwal terpisah untuk masing-masing rombel. Penempatan ruang tetap mengikuti periode ujian, tidak diacak ulang.</div></section>
 </>;
}
