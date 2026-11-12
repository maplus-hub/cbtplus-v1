import {useMemo,useState,type ChangeEvent} from 'react';
import * as XLSX from 'xlsx';
import {Download,Upload,Eye,Save} from 'lucide-react';
import {supabase} from './supabase';

type Kind='pg'|'mcma'|'kategori'|'esai';
type Question={id:string;kind:Kind;prompt:string;points:number;position:number;options:string[]};
type Key={question_id:string;answer:Record<string,unknown>;explanation:string|null};
type ImportRow={kind:Kind;prompt:string;options:string[];answer:Record<string,unknown>;points:number;explanation:string|null};
type Props={bankId:string;editable:boolean;questions:Question[];keys:Record<string,Key>;onNotice:(message:string)=>void;onReload:()=>Promise<void>};
const kinds:Kind[]=['pg','mcma','kategori','esai'];
const names:Record<Kind,string>={pg:'Pilihan Ganda',mcma:'PG Kompleks',kategori:'Kategori Benar/Salah',esai:'Esai'};
const targets:Record<Kind,number>={pg:20,mcma:10,kategori:10,esai:5};
const letters=['A','B','C','D','E'];
const str=(value:unknown)=>String(value??'').trim();
// Supabase RPC errors are structured objects; String(error) only produces '[object Object]'.
function describeRpcError(value:unknown):string{
 if(value instanceof Error)return value.message;
 if(value&&typeof value==='object'){
  const e=value as Record<string,unknown>;
  const info=[
   e.message ? `Pesan: ${String(e.message)}` : '',
   e.code ? `Kode: ${String(e.code)}` : '',
   e.details ? `Detail: ${String(e.details)}` : '',
   e.hint ? `Saran: ${String(e.hint)}` : '',
   e.status ? `HTTP: ${String(e.status)}` : '',
  ].filter(Boolean).join('\n');
  if(info)return info;
  try{return JSON.stringify(value,null,2)}catch{return 'Kesalahan tidak dikenal'}
 }
 return String(value);
}
const parseKeys=(value:string)=>value.toUpperCase().split(/[,;|\s]+/).map(x=>x.trim()).filter(Boolean);
function parseBool(value:string):boolean|null{const x=value.toLowerCase();if(['b','benar','true','1','ya'].includes(x))return true;if(['s','salah','false','0','tidak'].includes(x))return false;return null}
function validate(raw:Record<string,unknown>,index:number):ImportRow{
 const kind=str(raw.jenis).toLowerCase() as Kind,prompt=str(raw.pertanyaan),points=Number(str(raw.bobot)||'1');
 const at=`Baris Excel ${index+2}`;
 if(!kinds.includes(kind))throw Error(`${at}: jenis harus pg, mcma, kategori atau esai`);
 if(prompt.length<5)throw Error(`${at}: pertanyaan minimal 5 karakter`);
 if(!Number.isFinite(points)||points<0||points>10000)throw Error(`${at}: bobot harus 0–10000`);
 const explanation=str(raw.pembahasan)||null;
 if(kind==='esai'){
  const rubric=str(raw.rubrik)||str(raw.kunci);
  if(rubric.length<3)throw Error(`${at}: esai wajib memiliki rubrik (minimal 3 karakter)`);
  return {kind,prompt,points,options:[],answer:{rubric},explanation};
 }
 const options=(kind==='kategori'?Array.from({length:10},(_,i)=>str(raw[`opsi_${letters[i]||i+1}`])||str(raw[`pernyataan_${i+1}`])):letters.map(l=>str(raw[`opsi_${l}`])));
 // Opsi harus berurutan dan tidak boleh ada celah di tengah.
 let seenEmpty=false;const clean:string[]=[];
 for(const option of options){if(!option){seenEmpty=true;continue}if(seenEmpty)throw Error(`${at}: opsi tidak boleh loncat kolom`);clean.push(option)}
 if(clean.length<2||clean.length>(kind==='kategori'?10:5))throw Error(`${at}: jumlah opsi tidak valid`);
 const kunci=str(raw.kunci);
 if(kind==='kategori'){
  const values=kunci.split(/[,;|]/).map(s=>s.trim());
  if(values.length!==clean.length)throw Error(`${at}: jumlah kunci kategori harus sama dengan pernyataan`);
  const answers=values.map(parseBool);
  if(answers.some(v=>v===null))throw Error(`${at}: kunci kategori gunakan Benar/Salah dipisah koma`);
  return {kind,prompt,points,options:clean,answer:{answers},explanation};
 }
 const answerLetters=kind==='pg'?[kunci.toUpperCase()]:parseKeys(kunci);
 if(!answerLetters.length||new Set(answerLetters).size!==answerLetters.length||answerLetters.some(l=>!letters.slice(0,clean.length).includes(l)))throw Error(`${at}: kunci tidak sesuai opsi`);
 if(kind==='pg'&&answerLetters.length!==1)throw Error(`${at}: PG harus memiliki satu kunci`);
 return {kind,prompt,points,options:clean,answer:{correct:kind==='pg'?answerLetters[0]:answerLetters},explanation};
}
export default function BankTools({bankId,editable,questions,keys,onNotice,onReload}:Props){
 const [pending,setPending]=useState<ImportRow[]>([]),[errors,setErrors]=useState<string[]>([]),[busy,setBusy]=useState(false);
 const [preview,setPreview]=useState(false),[previewIndex,setPreviewIndex]=useState(0);
 const [weights,setWeights]=useState<Record<Kind,string>>({pg:'1',mcma:'1',kategori:'1',esai:'1'});
 const counts=useMemo(()=>Object.fromEntries(kinds.map(k=>[k,questions.filter(q=>q.kind===k).length])) as Record<Kind,number>,[questions]);
 const issues=useMemo(()=>{
  const result:string[]=[];
  for(const kind of kinds){if(counts[kind]!==targets[kind])result.push(`${names[kind]}: ${counts[kind]} dari target ${targets[kind]}`)}
  for(const [i,q] of questions.entries()){
   const answer=keys[q.id]?.answer;
   if(!q.prompt||q.prompt.trim().length<5)result.push(`Soal ${i+1}: teks belum valid`);
   if(q.points<=0)result.push(`Soal ${i+1}: bobot harus lebih dari 0`);
   if(!answer)result.push(`Soal ${i+1}: kunci jawaban belum tersedia`);
   if(q.kind==='pg'&&answer&&!letters.slice(0,q.options.length).includes(str(answer.correct)))result.push(`Soal ${i+1}: kunci PG belum valid`);
   if(q.kind==='mcma'&&answer&&(!Array.isArray(answer.correct)||answer.correct.length===0||answer.correct.some(x=>!letters.slice(0,q.options.length).includes(str(x)))))result.push(`Soal ${i+1}: kunci MCMA belum valid`);
   if(q.kind==='kategori'&&answer&&(!Array.isArray(answer.answers)||answer.answers.length!==q.options.length||answer.answers.some(x=>typeof x!=='boolean')))result.push(`Soal ${i+1}: kunci kategori belum valid`);
   if(q.kind==='esai'&&answer&&str(answer.rubric).length<3)result.push(`Soal ${i+1}: rubrik belum lengkap`);
  }
  return result;
 },[questions,keys,counts]);
 function template(){const rows=[
  {jenis:'pg',pertanyaan:'Berikut contoh soal pilihan ganda?',opsi_A:'Pilihan satu',opsi_B:'Pilihan dua',opsi_C:'Pilihan tiga',opsi_D:'Pilihan empat',opsi_E:'',kunci:'A',bobot:1,pembahasan:'Contoh pembahasan',rubrik:''},
  {jenis:'mcma',pertanyaan:'Pilih dua pernyataan yang benar!',opsi_A:'Pernyataan 1',opsi_B:'Pernyataan 2',opsi_C:'Pernyataan 3',opsi_D:'Pernyataan 4',opsi_E:'',kunci:'A,C',bobot:1,pembahasan:'',rubrik:''},
  {jenis:'kategori',pertanyaan:'Tentukan benar atau salah setiap pernyataan!',opsi_A:'Pernyataan pertama',opsi_B:'Pernyataan kedua',opsi_C:'Pernyataan ketiga',opsi_D:'',opsi_E:'',kunci:'Benar,Salah,Benar',bobot:1,pembahasan:'',rubrik:''},
  {jenis:'esai',pertanyaan:'Jelaskan konsep tersebut dengan contoh!',opsi_A:'',opsi_B:'',opsi_C:'',opsi_D:'',opsi_E:'',kunci:'',bobot:5,pembahasan:'',rubrik:'Konsep 3 poin, contoh 2 poin'}
 ];
  const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=Array.from({length:11},()=>({wch:24}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'SOAL');XLSX.writeFile(wb,'template-import-soal-cbtplus.xlsx');
 }
 async function fileChanged(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];e.target.value='';setPending([]);setErrors([]);if(!file)return;
  try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const ws=wb.Sheets.SOAL||wb.Sheets[wb.SheetNames[0]];const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(ws,{defval:''});if(raw.length===0)throw Error('File Excel tidak berisi soal');if(raw.length>200)throw Error('Maksimal 200 soal per impor');const valid:ImportRow[]=[],invalid:string[]=[];raw.forEach((row,i)=>{try{valid.push(validate(row,i))}catch(e){invalid.push(e instanceof Error?e.message:String(e))}});setPending(valid);setErrors(invalid);if(invalid.length)onNotice(`${invalid.length} baris tidak valid. Perbaiki semuanya sebelum impor.`)}catch(e){onNotice('Gagal membaca Excel: '+String(e))}
 }
 async function importAll(){if(!supabase||!editable||!pending.length||errors.length||busy)return;
  if(!window.confirm(`Impor ${pending.length} soal ke bank ini? Soal akan ditambahkan, bukan mengganti soal lama.`))return;
  setBusy(true);try{const {data,error}=await supabase.rpc('import_bank_questions',{p_bank_id:bankId,p_rows:pending});if(error)throw error;setPending([]);onNotice(`${data} soal berhasil diimpor dalam satu transaksi.`);await onReload()}catch(e){
   const message=describeRpcError(e);
   console.error('CBTPlus v1.6: impor soal gagal',e);
   onNotice('Impor gagal: '+message.replace(/\n/g,' | '));
   window.alert('Gagal impor soal ke Supabase:\n\n'+message+'\n\nTidak ada soal yang disimpan jika transaksi RPC dibatalkan.');
  }finally{setBusy(false)}
 }
 async function applyWeights(){if(!supabase||!editable||busy)return;const values=Object.fromEntries(kinds.map(k=>[k,Number(weights[k])])) as Record<Kind,number>;
  if(kinds.some(k=>!Number.isFinite(values[k])||values[k]<=0||values[k]>10000)){onNotice('Bobot harus lebih dari 0 dan maksimal 10000');return}
  if(!window.confirm('Samakan bobot semua soal sesuai jenis? Bobot per soal yang ada akan ditimpa.'))return;
  setBusy(true);try{const {data,error}=await supabase.rpc('set_bank_kind_weights',{p_bank_id:bankId,p_weights:values});if(error)throw error;onNotice(`${data} bobot soal diperbarui.`);await onReload()}catch(e){const message=describeRpcError(e);console.error('CBTPlus v1.6: bobot gagal',e);onNotice('Gagal mengatur bobot: '+message.replace(/\n/g,' | '));window.alert('Gagal mengatur bobot:\n\n'+message)}finally{setBusy(false)}
 }
 const q=questions[previewIndex];
 return <>
  <section className="panel"><div className="panelhead"><div><h3>Impor Soal Excel</h3><p>Validasi seluruh baris terlebih dahulu. Impor bersifat atomik: semua berhasil atau tidak ada yang disimpan.</p></div><button className="outlinebutton" type="button" onClick={template}><Download size={16}/> Template Excel</button></div>
   <label className="uploadbutton" style={{display:'inline-flex',cursor:editable?'pointer':'not-allowed'}}><Upload size={16}/> Pilih berkas .xlsx <input type="file" accept=".xlsx,.xls" disabled={!editable||busy} onChange={e=>void fileChanged(e)}/></label>
   {errors.length>0&&<div className="errorbox"><strong>{errors.length} masalah terdeteksi</strong><ul>{errors.slice(0,15).map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!pending.length&&<div className="infobox">{pending.length} soal terbaca. {errors.length?'Perbaiki file dahulu.':'Semua baris valid dan siap diimpor.'} <button type="button" className="primary" disabled={!editable||busy||!!errors.length} onClick={()=>void importAll()}>{busy?'Memproses…':`Impor ${pending.length} Soal`}</button></div>}
  </section>
  <section className="panel"><h3>Pengaturan Bobot per Jenis Soal</h3><p>Bobot berlaku per soal. Total skor maksimal akan dihitung otomatis dari seluruh soal.</p><div className="formgrid">{kinds.map(k=><label key={k}>{names[k]}<input type="number" min="0.25" max="10000" step="0.25" value={weights[k]} disabled={!editable||busy} onChange={e=>setWeights(v=>({...v,[k]:e.target.value}))}/></label>)}</div><button className="primary" type="button" disabled={!editable||busy} onClick={()=>void applyWeights()}><Save size={16}/> Terapkan Bobot ke Semua Soal</button><p><b>Skor maksimal saat ini:</b> {questions.reduce((sum,q)=>sum+Number(q.points),0).toLocaleString('id-ID')}</p></section>
  <section className="panel"><div className="panelhead"><div><h3>Pemeriksaan Kesiapan Bank</h3><p>Acuan default juknis: 20 PG, 10 MCMA, 10 kategori, 5 esai. Jumlah esai dapat berbeda sesuai mapel; penilaian akhir tetap memerlukan kebijakan sekolah.</p></div></div><p><strong>{issues.length===0?'Bank sesuai acuan komposisi dan kunci lengkap':`${issues.length} catatan kesiapan`}</strong></p>{issues.length>0&&<ul>{issues.map((item,i)=><li key={i}>{item}</li>)}</ul>}{issues.length===0&&<p>Bank siap untuk pemeriksaan guru sebelum dipakai pada sesi ujian.</p>}</section>
  <section className="panel"><div className="panelhead"><div><h3>Pratinjau Tampilan Siswa</h3><p>Pratinjau ini tidak mengirim jawaban dan tidak menampilkan kunci.</p></div><button type="button" className="outlinebutton" disabled={!questions.length} onClick={()=>{setPreview(v=>!v);setPreviewIndex(0)}}><Eye size={16}/>{preview?'Tutup':'Lihat'} Pratinjau</button></div>
   {preview&&q&&<div style={{maxWidth:800,margin:'auto'}}><small>Soal {previewIndex+1} dari {questions.length} · {names[q.kind]}</small><h3 style={{whiteSpace:'pre-wrap'}}>{q.prompt}</h3>{q.kind==='esai'?<textarea aria-label="Simulasi jawaban esai" rows={5} placeholder="Ketik jawaban siswa di sini (simulasi)…"/>:<div style={{display:'grid',gap:10}}>{q.options.map((opt,i)=><label key={`${q.id}-${i}`} style={{display:'flex',gap:10,alignItems:'start'}}><input name={`preview-${q.id}`} type={q.kind==='pg'?'radio':'checkbox'} style={{width:18}}/>{q.kind==='kategori'?`${i+1}. `:`${letters[i]}. `}{opt}{q.kind==='kategori'&&<select defaultValue="" aria-label={`Jawaban pernyataan ${i+1}`}><option value="">Pilih</option><option>Benar</option><option>Salah</option></select>}</label>)}</div>}<div className="formactions" style={{marginTop:16}}><button type="button" className="outlinebutton" disabled={previewIndex===0} onClick={()=>setPreviewIndex(n=>n-1)}>Sebelumnya</button><button type="button" className="primary" disabled={previewIndex===questions.length-1} onClick={()=>setPreviewIndex(n=>n+1)}>Berikutnya</button></div></div>}
  </section>
 </>;
}
