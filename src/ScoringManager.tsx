import {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {supabase} from './supabase';
import {ArrowLeft,Download,RefreshCw,Save,ClipboardCheck,History} from 'lucide-react';

type Period={id:string;title:string;academic_year:string};
type Schedule={id:string;period_id:string;subject_id:string;class_id:string|null;bank_id:string|null;status:string;starts_at:string};
type Subject={id:string;name:string};
type Class={id:string;code:string};
type Bank={id:string;title:string;owner_id:string};
type Result={attempt_id:string;student_id:string;nis:string;name:string;class_name:string;status:string;submitted_at:string|null;auto_points:number;manual_points:number;total_points:number;maximum:number;score_100:number;pending_essay:number;answered:number};
type Detail={question_id:string;position:number;kind:'pg'|'mcma'|'kategori'|'esai';prompt:string;max_points:number;student_answer:Record<string,unknown>|null;rubric:string|null;auto_points:number;manual_points:number|null;feedback:string;graded_by:string|null;graded_at:string|null};
type Audit={question_id:string;old_points:number|null;new_points:number;changed_by:string;changed_at:string;old_feedback:string|null;new_feedback:string|null};
const kindLabel:Record<Detail['kind'],string>={pg:'PG',mcma:'PG Kompleks',kategori:'Benar/Salah',esai:'Esai'};
const formatNumber=(n:number)=>Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2});
const errorText=(e:unknown)=>{const x=e as {message?:string;details?:string;hint?:string;code?:string};return [x?.message,x?.details,x?.hint,x?.code].filter(Boolean).join(' · ')||String(e)};

export default function ScoringManager({period,subjects,classes,banks,isAdmin,userId,onNotice}:{period?:Period;subjects:Subject[];classes:Class[];banks:Bank[];isAdmin:boolean;userId:string;onNotice:(message:string)=>void}){
 const [schedules,setSchedules]=useState<Schedule[]>([]),[selectedSchedule,setSelectedSchedule]=useState('');
 const [results,setResults]=useState<Result[]>([]),[selectedAttempt,setSelectedAttempt]=useState('');
 const [details,setDetails]=useState<Detail[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 const [saving,setSaving]=useState<string|null>(null),[loading,setLoading]=useState(false),[drafts,setDrafts]=useState<Record<string,{points:string;feedback:string}>>({});
 const [query,setQuery]=useState('');
 const selectedResult=results.find(r=>r.attempt_id===selectedAttempt);
 const schedule=schedules.find(s=>s.id===selectedSchedule);
 const filtered=useMemo(()=>results.filter(r=>`${r.nis} ${r.name} ${r.class_name}`.toLowerCase().includes(query.toLowerCase())),[results,query]);

 useEffect(()=>{
   setSelectedSchedule('');setResults([]);setSelectedAttempt('');setDetails([]);setAudit([]);
   if(!supabase||!period)return;
   let live=true;
   void supabase.from('exam_schedules')
    .select('id,period_id,subject_id,class_id,bank_id,status,starts_at')
    .eq('period_id',period.id).not('bank_id','is',null).order('starts_at')
    .then(({data,error})=>{if(!live)return;if(error){onNotice('Gagal mengambil jadwal: '+error.message);return}setSchedules(((data||[]) as Schedule[]).filter(s=>isAdmin||banks.some(b=>b.id===s.bank_id&&b.owner_id===userId)))});
   return()=>{live=false};
 },[period?.id,isAdmin,userId,banks]);

 async function loadResults(scheduleId=selectedSchedule){
  if(!supabase||!scheduleId)return;
  setLoading(true);
  try{
   const {data,error}=await supabase.rpc('cbt_v17_results',{p_schedule:scheduleId});
   if(error)throw error;
   setResults((data||[]) as Result[]);
  }catch(e){onNotice('Gagal memuat penilaian: '+errorText(e))}
  finally{setLoading(false)}
 }
 async function loadDetail(attempt:string){
  if(!supabase||!attempt)return;
  setLoading(true);
  try{
   const [a,b]=await Promise.all([
    supabase.rpc('cbt_v17_detail',{p_attempt:attempt}),
    supabase.rpc('cbt_v17_audit',{p_attempt:attempt})
   ]);
   if(a.error)throw a.error;if(b.error)throw b.error;
   const items=(a.data||[]) as Detail[];
   setDetails(items);setAudit((b.data||[]) as Audit[]);
   setDrafts(Object.fromEntries(items.filter(q=>q.kind==='esai').map(q=>[q.question_id,{points:q.manual_points===null?'':String(q.manual_points),feedback:q.feedback||''}])));
  }catch(e){onNotice('Gagal mengambil rincian: '+errorText(e))}
  finally{setLoading(false)}
 }
 async function saveEssay(q:Detail){
  if(!supabase||!selectedAttempt||!selectedResult)return;
  if(selectedResult.status!=='selesai'){onNotice('Koreksi hanya untuk pengerjaan berstatus selesai.');return}
  const draft=drafts[q.question_id];const score=Number(draft?.points);
  if(!draft||draft.points.trim()===''||!Number.isFinite(score)||score<0||score>Number(q.max_points)){
   onNotice(`Nilai esai harus 0 sampai ${formatNumber(q.max_points)}.`);return;
  }
  setSaving(q.question_id);
  try{
   const {error}=await supabase.rpc('cbt_v17_grade_essay',{
    p_attempt:selectedAttempt,p_question:q.question_id,p_points:score,p_feedback:draft.feedback||''
   });
   if(error)throw error;
   await loadResults();await loadDetail(selectedAttempt);
   onNotice('Nilai esai berhasil disimpan dan tercatat pada audit.');
  }catch(e){onNotice('Gagal menyimpan nilai: '+errorText(e))}
  finally{setSaving(null)}
 }
 function exportExcel(){
  if(!results.length||!schedule)return;
  const rows=results.map((r,i)=>({
   No:i+1,NIS:r.nis,'Nama Peserta':r.name,Kelas:r.class_name,Status:r.status,
   'Skor Otomatis':Number(r.auto_points),'Skor Esai':Number(r.manual_points),
   'Skor Total':Number(r.total_points),'Skor Maksimal':Number(r.maximum),
   'Nilai 0-100':Number(r.score_100),'Esai Belum Dinilai':Number(r.pending_essay),
   Keterangan:r.status!=='selesai'?'Belum selesai':r.pending_essay>0?'Nilai sementara':'Selesai dikoreksi'
  }));
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:7},{wch:17},{wch:35},{wch:12},{wch:16},{wch:16},{wch:14},{wch:14},{wch:16},{wch:14},{wch:22},{wch:25}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Nilai');
  XLSX.writeFile(wb,`cbtplus-nilai-${period?.academic_year.replace('/','-')||'periode'}-${schedule.id.slice(0,8)}.xlsx`);
 }
 function renderAnswer(q:Detail){
  if(!q.student_answer)return 'Belum dijawab';
  const a=q.student_answer;
  if(q.kind==='esai')return String(a.text??a.answer??'(format jawaban tidak dikenali)');
  if(q.kind==='pg')return String(a.correct??'(format tidak dikenali)');
  if(q.kind==='mcma')return Array.isArray(a.selected)?a.selected.join(', '):'(format tidak dikenali)';
  if(q.kind==='kategori')return Array.isArray(a.answers)?a.answers.map((v,i)=>`${i+1}: ${v===true?'Benar':v===false?'Salah':'Tidak valid'}`).join(' · '):'(format tidak dikenali)';
  return '—';
 }
 return <>
  <div className="pageintro"><div><h2>Penilaian & Rekap Nilai</h2><p>PG otomatis, MCMA parsial dengan penalti, kategori per pernyataan, dan esai dikoreksi guru.</p></div></div>
  <section className="panel">
   <h3>Pilih Jadwal Ujian</h3><div className="formgrid">
    <label>Jadwal periode {period?.title||'belum aktif'}
     <select value={selectedSchedule} onChange={e=>{setSelectedSchedule(e.target.value);setSelectedAttempt('');setResults([]);setDetails([]);setAudit([]);if(e.target.value)void loadResults(e.target.value)}}>
      <option value="">-- Pilih ujian --</option>
      {schedules.map(s=><option key={s.id} value={s.id}>{new Date(s.starts_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'})} · {subjects.find(x=>x.id===s.subject_id)?.name||'Mapel'} · {classes.find(x=>x.id===s.class_id)?.code||'Semua'} · {banks.find(x=>x.id===s.bank_id)?.title||'Bank'} [{s.status}]</option>)}
     </select>
    </label>
   </div>
   <div className="formactions"><button type="button" className="outlinebutton" disabled={!selectedSchedule||loading} onClick={()=>void loadResults()}><RefreshCw size={16}/> Hitung Ulang & Muat Nilai</button><button type="button" className="outlinebutton" disabled={!results.length} onClick={exportExcel}><Download size={16}/> Ekspor Nilai Excel</button></div>
   <p style={{fontSize:13,opacity:.8}}>Hasil bersifat sementara selama pengerjaan belum selesai atau masih ada esai yang belum dinilai. Jika belum ada pengerjaan siswa, tabel akan kosong.</p>
  </section>
  {selectedSchedule&&!selectedAttempt&&<section className="panel">
   <div className="panelhead"><div><h3>Hasil Peserta ({results.length})</h3><p>Nilai skala 100 dihitung dari skor total dibagi jumlah bobot semua soal.</p></div><div className="searchbox"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari NIS, nama, kelas"/></div></div>
   <div className="scrolltable"><table><thead><tr><th>NIS</th><th>Peserta</th><th>Kelas</th><th>Status</th><th>Otomatis</th><th>Esai</th><th>Total</th><th>Nilai / 100</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>
    {filtered.map(r=><tr key={r.attempt_id}><td>{r.nis}</td><td><b>{r.name}</b></td><td>{r.class_name}</td><td>{r.status}</td><td>{formatNumber(r.auto_points)}</td><td>{formatNumber(r.manual_points)}</td><td>{formatNumber(r.total_points)} / {formatNumber(r.maximum)}</td><td><b>{formatNumber(r.score_100)}</b></td><td>{r.status!=='selesai'?'Sementara':r.pending_essay?'Esai belum dikoreksi':'Lengkap'}</td><td><button type="button" className="outlinebutton" onClick={()=>{setSelectedAttempt(r.attempt_id);void loadDetail(r.attempt_id)}}>Detail / Koreksi</button></td></tr>)}
    {!filtered.length&&<tr><td colSpan={10} className="empty">{loading?'Memuat nilai…':'Belum ada pengerjaan untuk jadwal ini.'}</td></tr>}
   </tbody></table></div>
  </section>}
  {selectedResult&&<>
   <section className="panel"><button type="button" className="outlinebutton" onClick={()=>{setSelectedAttempt('');setDetails([]);setAudit([])}}><ArrowLeft size={16}/> Kembali ke rekap</button><h3 style={{marginTop:12}}>Koreksi: {selectedResult.name} ({selectedResult.nis})</h3><p>Skor {formatNumber(selectedResult.total_points)} / {formatNumber(selectedResult.maximum)} · Nilai {formatNumber(selectedResult.score_100)} · Esai tertunda {selectedResult.pending_essay}</p></section>
   {details.map(q=><section className="panel" key={q.question_id}>
    <div className="panelhead"><div><h3>Soal {q.position} · {kindLabel[q.kind]}</h3><p>Bobot maksimal {formatNumber(q.max_points)} poin</p></div><strong>{q.kind==='esai'?(q.manual_points===null?'Belum dikoreksi':`Nilai ${formatNumber(q.manual_points)}`):`Otomatis ${formatNumber(q.auto_points)}`}</strong></div>
    <p style={{whiteSpace:'pre-wrap'}}>{q.prompt}</p><div className="infobox"><strong>Jawaban siswa</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{renderAnswer(q)}</p></div>
    {q.kind==='esai'&&<><p><strong>Pedoman / rubrik guru:</strong> {q.rubric||'Tidak tersedia'}</p><div className="formgrid"><label>Nilai (0–{formatNumber(q.max_points)})<input type="number" min="0" max={Number(q.max_points)} step="0.01" disabled={!q.student_answer||selectedResult.status!=='selesai'} value={drafts[q.question_id]?.points??''} onChange={e=>setDrafts(v=>({...v,[q.question_id]:{points:e.target.value,feedback:v[q.question_id]?.feedback||''}}))}/></label><label>Catatan guru<input maxLength={2000} disabled={!q.student_answer||selectedResult.status!=='selesai'} value={drafts[q.question_id]?.feedback??''} onChange={e=>setDrafts(v=>({...v,[q.question_id]:{points:v[q.question_id]?.points||'',feedback:e.target.value}}))}/></label></div><button type="button" className="primary" disabled={!q.student_answer||selectedResult.status!=='selesai'||saving!==null} onClick={()=>void saveEssay(q)}><Save size={16}/>{saving===q.question_id?'Menyimpan…':'Simpan Nilai Esai'}</button></>}
   </section>)}
   <section className="panel"><h3><History size={18} style={{verticalAlign:'middle'}}/> Riwayat Koreksi Esai</h3>{!audit.length?<p>Belum ada perubahan nilai manual.</p>:<div className="scrolltable"><table><thead><tr><th>Waktu</th><th>Soal</th><th>Nilai Lama</th><th>Nilai Baru</th><th>Pengoreksi</th><th>Catatan</th></tr></thead><tbody>{audit.map((a,i)=><tr key={i}><td>{new Date(a.changed_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</td><td>{details.find(d=>d.question_id===a.question_id)?.position||'-'}</td><td>{a.old_points===null?'Belum dinilai':formatNumber(a.old_points)}</td><td>{formatNumber(a.new_points)}</td><td>{a.changed_by}</td><td>{a.new_feedback||'-'}</td></tr>)}</tbody></table></div>}</section>
  </>}
  <div className="infobox" style={{marginTop:16}}><ClipboardCheck size={18} style={{verticalAlign:'middle'}}/> Modul v1.7 membaca jawaban dari <code>student_answers</code>. Aplikasi siswa dan pengumpulan jawaban belum disertakan pada paket ini.</div>
 </>;
}
