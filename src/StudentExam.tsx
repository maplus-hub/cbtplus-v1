import {useEffect,useMemo,useRef,useState} from 'react';
import {supabase,configured} from './supabase';
import {BookOpen,CheckCircle2,Clock3,LockKeyhole,LogOut,RefreshCw,Save,Send,ShieldCheck} from 'lucide-react';

type Catalog={id:string;subject:string;class:string;starts_at:string;ends_at:string;status:string;instructions:string};
type Question={id:string;kind:'pg'|'mcma'|'kategori'|'esai';position:number;prompt:string;options:string[];answer:Record<string,unknown>|null};
type Exam={attempt_id:string;ends_at:string;status:string;questions:Question[]};
type Answer={correct?:string;selected?:string[];answers?:(boolean|null)[];text?:string};
const labelKind:Record<Question['kind'],string>={pg:'Pilihan Ganda',mcma:'Pilihan Ganda Kompleks',kategori:'Benar / Salah',esai:'Esai'};
const abc=['A','B','C','D','E'];
function errorText(e:unknown){if(e&&typeof e==='object'&&'message'in e)return String((e as {message:unknown}).message);return String(e)}
function defaultAnswer(q:Question):Answer{if(q.answer)return q.answer as Answer;if(q.kind==='pg')return {};if(q.kind==='mcma')return{selected:[]};if(q.kind==='kategori')return{answers:q.options.map(()=>null)};return{text:''}}
function isAnswered(q:Question,a?:Answer){if(!a)return false;if(q.kind==='pg')return !!a.correct;if(q.kind==='mcma')return !!a.selected?.length;if(q.kind==='kategori')return !!a.answers?.some(v=>v!==null);return !!a.text?.trim()}
function human(dt:string){return new Date(dt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB'}
function countdown(ms:number){const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor(s%3600/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`}

export default function StudentExam(){
 const [session,setSession]=useState<any>(null),[authBusy,setAuthBusy]=useState(true);
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [catalog,setCatalog]=useState<Catalog[]>([]),[listBusy,setListBusy]=useState(false),[busy,setBusy]=useState(false);
 const [chosen,setChosen]=useState<Catalog|null>(null),[token,setToken]=useState(''),[exam,setExam]=useState<Exam|null>(null);
 const [answers,setAnswers]=useState<Record<string,Answer>>({}),[saving,setSaving]=useState<Record<string,boolean>>({});
 const [notice,setNotice]=useState(''),[now,setNow]=useState(Date.now()),[page,setPage]=useState(0),[completed,setCompleted]=useState(false);
 const saved=useRef<Record<string,string>>({}),inflight=useRef<Set<string>>(new Set());
 useEffect(()=>{if(!supabase){setAuthBusy(false);return;}const client=supabase;void client.auth.getSession().then(({data,error})=>{if(error)setNotice(error.message);setSession(data.session);setAuthBusy(false)});
  const {data:{subscription}}=client.auth.onAuthStateChange((_e,s)=>{setSession(s);setAuthBusy(false)});return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{const handle=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(handle)},[]);
 useEffect(()=>{if(!session?.user?.id){setCatalog([]);setExam(null);return}void refreshCatalog()},[session?.user?.id]);
 async function refreshCatalog(){if(!supabase)return;setListBusy(true);const {data,error}=await supabase.rpc('cbt_v18_catalog');if(error)setNotice('Gagal memuat jadwal: '+error.message);else setCatalog((data||[]) as Catalog[]);setListBusy(false)}
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setNotice('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setNotice('Login gagal: '+error.message);setBusy(false)}
 async function logout(){await supabase?.auth.signOut();setExam(null);setChosen(null);setToken('');setNotice('');setCompleted(false)}
 async function openExam(){if(!supabase||!chosen||!token.trim())return;setBusy(true);setNotice('');try{
   const {data,error}=await supabase.rpc('cbt_v18_start',{p_schedule:chosen.id,p_token:token.trim()});if(error)throw error;
   const payload=data as Exam;setExam(payload);setPage(0);setCompleted(false);
   const initial=Object.fromEntries(payload.questions.map(q=>[q.id,defaultAnswer(q)]));setAnswers(initial);
   saved.current=Object.fromEntries(payload.questions.filter(q=>q.answer).map(q=>[q.id,JSON.stringify(q.answer)]));
  }catch(e){setNotice('Gagal masuk ujian: '+errorText(e))}finally{setBusy(false)}}
 async function saveOne(qid:string,a:Answer,force=false):Promise<boolean>{if(!supabase||!exam)return false;
   const q=exam.questions.find(x=>x.id===qid);if(!q||!isAnswered(q,a))return true;
   const signature=JSON.stringify(a);if(!force&&saved.current[qid]===signature)return true;
   if(inflight.current.has(qid))return false;
   inflight.current.add(qid);setSaving(v=>({...v,[qid]:true}));
   try{const {error}=await supabase.rpc('cbt_v18_save',{p_attempt:exam.attempt_id,p_question:qid,p_answer:a});if(error)throw error;
       saved.current[qid]=signature;return true;
   }catch(e){setNotice('Jawaban belum tersimpan: '+errorText(e));return false}
   finally{inflight.current.delete(qid);setSaving(v=>({...v,[qid]:false}))}
 }
 // Simpan otomatis setelah siswa berhenti mengetik/memilih. Submit memeriksa semua jawaban lagi.
 useEffect(()=>{if(!exam)return;const dirty=exam.questions.filter(q=>isAnswered(q,answers[q.id])&&saved.current[q.id]!==JSON.stringify(answers[q.id])&&!inflight.current.has(q.id));
   if(!dirty.length)return;
   const handle=window.setTimeout(()=>{for(const q of dirty)void saveOne(q.id,answers[q.id])},900);
   return()=>window.clearTimeout(handle);
 },[answers,exam]);
 const remaining=exam?new Date(exam.ends_at).getTime()-now:0;
 const answered=useMemo(()=>exam?.questions.filter(q=>isAnswered(q,answers[q.id])).length||0,[exam,answers]);
 const dirtyCount=exam?.questions.filter(q=>isAnswered(q,answers[q.id])&&saved.current[q.id]!==JSON.stringify(answers[q.id])).length||0;
 async function submitExam(auto=false){if(!supabase||!exam||busy)return;
   if(!auto&&!window.confirm(`Kumpulkan ujian? ${answered} dari ${exam.questions.length} soal terisi. Setelah dikumpulkan, jawaban tidak dapat diubah.`))return;
   setBusy(true);setNotice('');
   try{
     // Jangan mengklaim terkirim bila jawaban terbaru belum tersimpan.
     if(remaining>0){
       for(const q of exam.questions){const a=answers[q.id];if(!isAnswered(q,a))continue;
          let n=0;while(inflight.current.has(q.id)&&n++<40)await new Promise(r=>setTimeout(r,100));
          if(saved.current[q.id]!==JSON.stringify(a)){
            const ok=await saveOne(q.id,a,true);if(!ok)throw Error('Ada jawaban yang belum tersimpan. Periksa koneksi lalu coba lagi.');
          }
       }
     }else if(dirtyCount>0){setNotice('Waktu habis. Jawaban yang belum tersimpan tidak dapat dikirim. Jawaban tersimpan akan dinilai.');}
     const {error}=await supabase.rpc('cbt_v18_submit',{p_attempt:exam.attempt_id});if(error)throw error;
     setExam(null);setChosen(null);setToken('');setCompleted(true);await refreshCatalog();
   }catch(e){setNotice('Gagal mengumpulkan: '+errorText(e))}finally{setBusy(false)}
 }
 const submitRef=useRef(submitExam);submitRef.current=submitExam;
 useEffect(()=>{if(exam&&remaining<=0&&!busy)void submitRef.current(true)},[exam?.attempt_id,remaining<=0,busy]);
 function change(q:Question,a:Answer){setAnswers(v=>({...v,[q.id]:a}))}
 if(!configured)return <div className="centerpage"><div className="authbox">Konfigurasi Supabase belum tersedia.</div></div>;
 if(authBusy)return <div className="centerpage">Memeriksa sesi siswa…</div>;
 if(!session)return <div className="centerpage"><form className="authbox" onSubmit={login}>
   <div className="brandmark"><ShieldCheck/></div><h1>CBT<span>Plus</span></h1><h2>Portal Peserta Ujian</h2><p>MA Plus Sunan Giri Salatiga</p>
   <label>Email akun siswa<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button className="primary wide" disabled={busy}>{busy?'Masuk…':'Masuk sebagai Siswa'}</button>{notice&&<div className="alert">{notice}</div>}
   <p style={{fontSize:12}}>Akun siswa dibuat dan dibagikan oleh administrator sekolah.</p></form></div>;
 const current=exam?.questions[page];
 return <div style={{maxWidth:1030,margin:'0 auto',padding:'18px 14px 80px'}}>
  <header className="panel" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
   <div><h2 style={{margin:0}}>CBT<span style={{color:'#079766'}}>Plus</span> — Ujian Siswa</h2><small>MA Plus Sunan Giri Salatiga</small></div>
   <button type="button" className="outlinebutton" disabled={busy} onClick={()=>void logout()}><LogOut size={16}/> Keluar</button>
  </header>
  {notice&&<div className="alert" role="alert" style={{marginBottom:16,whiteSpace:'pre-wrap'}}>{notice}</div>}
  {completed&&<section className="panel" style={{textAlign:'center'}}><CheckCircle2 size={45} color="#07845c"/><h2>Jawaban berhasil dikumpulkan</h2><p>Hasil ujian akan diolah oleh sistem penilaian CBTPlus.</p><button className="outlinebutton" onClick={()=>setCompleted(false)}>Kembali ke Jadwal</button></section>}
  {!exam&&!completed&&<>
   <section className="panel"><div className="panelhead"><h3><BookOpen size={20} style={{verticalAlign:'middle'}}/> Jadwal Ujian Saya</h3><button type="button" className="outlinebutton" disabled={listBusy} onClick={()=>void refreshCatalog()}><RefreshCw size={16}/> Muat Ulang</button></div>
    {!catalog.length?<p>{listBusy?'Memuat jadwal…':'Belum ada jadwal terbit atau akun siswa belum dipetakan. Hubungi admin.'}</p>:<div style={{display:'grid',gap:12}}>{catalog.map(c=><div key={c.id} className="infobox" style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><b>{c.subject} — {c.class}</b><div style={{fontSize:13}}>{human(c.starts_at)} s.d. {human(c.ends_at)}</div><small>Status: {c.status}</small></div><button className="primary" type="button" disabled={c.status==='selesai'||c.status==='terkunci'||(new Date(c.ends_at).getTime()<=now&&c.status!=='mengerjakan')||new Date(c.starts_at).getTime()>now} onClick={()=>{setChosen(c);setToken('');setNotice('')}}>{c.status==='selesai'?'Selesai':'Masuk Ujian'}</button></div>)}</div>}
   </section>
   {chosen&&<section className="panel"><h3><LockKeyhole size={19} style={{verticalAlign:'middle'}}/> Token {chosen.subject}</h3><p>Masukkan token yang diberikan pengawas. Waktu ujian mengikuti jadwal server.</p><label>Token ujian<input value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" maxLength={32}/></label><div className="formactions"><button type="button" className="primary" onClick={()=>void openExam()} disabled={busy||!token.trim()}>{busy?'Memverifikasi…':'Mulai / Lanjutkan'}</button><button type="button" className="outlinebutton" onClick={()=>setChosen(null)}>Batal</button></div></section>}
  </>}
  {exam&&current&&<>
    <section className="panel" style={{position:'sticky',top:8,zIndex:2,boxShadow:'0 6px 20px rgba(0,0,0,.06)'}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong><Clock3 size={17} style={{verticalAlign:'middle'}}/> Sisa waktu: <span style={{color:remaining<300000?'#b91c1c':'#08744f'}}>{countdown(remaining)}</span></strong><span>Terjawab {answered}/{exam.questions.length} · Belum tersimpan {dirtyCount}</span></div>
     <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:14}}>{exam.questions.map((q,i)=><button type="button" key={q.id} onClick={()=>setPage(i)} style={{border:'1px solid #cad7cf',borderRadius:8,padding:'7px 11px',background:i===page?'#087c54':isAnswered(q,answers[q.id])?'#d5f4e2':'#fff',color:i===page?'white':'#243a32',cursor:'pointer'}}>{i+1}</button>)}</div>
    </section>
    <section className="panel"><div className="panelhead"><div><h3>Soal {page+1} dari {exam.questions.length}</h3><p>{labelKind[current.kind]}</p></div><span><Save size={15} style={{verticalAlign:'middle'}}/> {saving[current.id]?'Menyimpan…':saved.current[current.id]===JSON.stringify(answers[current.id])?'Tersimpan':'Belum tersimpan'}</span></div>
     <p style={{fontSize:18,whiteSpace:'pre-wrap',lineHeight:1.6}}>{current.prompt}</p>
     {current.kind==='pg'&&<div style={{display:'grid',gap:12}}>{current.options.map((opt,i)=><label key={i} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}><input type="radio" name={'pg-'+current.id} checked={answers[current.id]?.correct===abc[i]} onChange={()=>change(current,{correct:abc[i]})}/><span>{abc[i]}. {opt}</span></label>)}</div>}
     {current.kind==='mcma'&&<div style={{display:'grid',gap:12}}><small>Pilih semua jawaban yang dianggap benar.</small>{current.options.map((opt,i)=>{const selected=answers[current.id]?.selected||[];return <label key={i} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}><input type="checkbox" checked={selected.includes(abc[i])} onChange={e=>change(current,{selected:e.target.checked?[...selected,abc[i]].sort():selected.filter(x=>x!==abc[i])})}/><span>{abc[i]}. {opt}</span></label>})}</div>}
     {current.kind==='kategori'&&<div style={{display:'grid',gap:12}}>{current.options.map((opt,i)=>{const answersCat=answers[current.id]?.answers||current.options.map(()=>null);return <div key={i} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'center',padding:'8px 0',borderBottom:'1px solid #eee'}}><span>{i+1}. {opt}</span>{[true,false].map(b=><label key={String(b)} style={{display:'flex',gap:5,alignItems:'center'}}><input type="radio" name={current.id+'-'+i} checked={answersCat[i]===b} onChange={()=>change(current,{answers:answersCat.map((x,j)=>j===i?b:x)})}/>{b?'Benar':'Salah'}</label>)}</div>})}</div>}
     {current.kind==='esai'&&<textarea rows={9} maxLength={20000} style={{width:'100%',padding:12,border:'1px solid #cad7cf',borderRadius:8,boxSizing:'border-box'}} placeholder="Tulis jawaban Anda…" value={answers[current.id]?.text||''} onChange={e=>change(current,{text:e.target.value})}/>}
     <div className="formactions" style={{marginTop:18}}><button type="button" className="outlinebutton" disabled={page===0} onClick={()=>setPage(n=>Math.max(0,n-1))}>Sebelumnya</button><button type="button" className="outlinebutton" disabled={page===exam.questions.length-1} onClick={()=>setPage(n=>Math.min(exam.questions.length-1,n+1))}>Berikutnya</button><button type="button" className="primary" disabled={busy} onClick={()=>void submitExam()}><Send size={16}/>{busy?'Mengirim…':'Kumpulkan Ujian'}</button></div>
    </section>
    <div className="infobox"><ShieldCheck size={16} style={{verticalAlign:'middle'}}/> Jawaban disimpan ke server saat terhubung internet. Pastikan tidak ada tanda “Belum tersimpan” sebelum menutup aplikasi.</div>
  </>}
 </div>;
}
