import {useEffect,useState} from 'react';
import {BookOpen,ExternalLink,LogOut,RefreshCw,ShieldCheck} from 'lucide-react';

type StudentInfo={
 student_id:string;schedule_id:string;room_id:string;nis:string;student_name:string;
 class_name:string;subject_name:string;starts_at:string;ends_at:string;
 delivery_mode:'instant_form'|'internal';form_url:string|null;can_start:boolean;
 attempt_id:string|null;attempt_status:string|null;student_progress?:string|null;supervisor_status?:string|null;
};
const API=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-center`;
const KEY='cbtplus_student_v19_session';
function getDevice(){
 let id=localStorage.getItem('cbtplus_student_v19_device');
 if(!id){
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
  const h=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
  id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  localStorage.setItem('cbtplus_student_v19_device',id)
 }
 return id;
}
async function request(op:string,payload:Record<string,unknown>={}){
 const result=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({op,...payload})});
 const data=await result.json();if(!result.ok||data.ok===false)throw new Error(data.error||'Permintaan gagal');return data;
}
function datetime(input:string){return new Date(input).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB'}
export default function StudentNisPortal(){
 const [nis,setNis]=useState(''),[token,setToken]=useState('');
 const [session,setSession]=useState<string|null>(()=>sessionStorage.getItem(KEY));
 const [info,setInfo]=useState<StudentInfo|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [exitToken,setExitToken]=useState(''),[exitGranted,setExitGranted]=useState(false);
 async function refresh(sess=session){if(!sess)return;setBusy(true);try{
   const data=await request('student_info',{session:sess,device:getDevice()});setInfo(data as StudentInfo);setError('');
 }catch(e){setError(e instanceof Error?e.message:String(e));sessionStorage.removeItem(KEY);setSession(null);setInfo(null)}finally{setBusy(false)}}
 useEffect(()=>{if(session)void refresh(session)},[]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const data=await request('student_login',{nis:nis.trim(),token:token.trim().toUpperCase(),device:getDevice()});
  sessionStorage.setItem(KEY,data.session);setSession(data.session);setToken('');
  await refresh(data.session);
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 async function studentAction(op:'form_opened'|'request_exit'|'exit',code=''){
   if(!session||busy)return;setBusy(true);setError('');
   try {
     await request('student_instant_action',{session,device:getDevice(),action:op,token:code});
     if(op==='exit'){
       setExitGranted(true);sessionStorage.removeItem(KEY);setSession(null);setInfo(null);setToken('');setExitToken('');return;
     }
     await refresh(session);
   }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function logout(){
   if(info?.delivery_mode==='instant_form'){
     setError('Gunakan Meminta Izin Keluar, tunggu konfirmasi pengawas, lalu masukkan Token Izin.');return;
   }
   if(session){try{await request('student_logout',{session,device:getDevice()})}catch{/* Session can expire */}}
   sessionStorage.removeItem(KEY);setSession(null);setInfo(null);setToken('');setError('');
 }

 if(!import.meta.env.VITE_SUPABASE_URL||!import.meta.env.VITE_SUPABASE_ANON_KEY)return <main className="centerpage"><p>Konfigurasi Supabase belum tersedia.</p></main>;
 if(exitGranted)return <main className="centerpage"><section className="authbox"><h2>Izin keluar berhasil</h2><p>Ujian sudah dikonfirmasi pengawas dan sesi CBTPlus telah diakhiri.</p><button type="button" className="primary wide" onClick={()=>setExitGranted(false)}>Kembali ke login</button></section></main>;
 if(!session)return <main className="centerpage"><form className="authbox" onSubmit={e=>void login(e)}>
  <div className="brandmark"><ShieldCheck/></div><h1>CBT<span>Plus</span></h1><h2>Portal Peserta Ujian</h2><p>MA Plus Sunan Giri Salatiga</p>
  <label>Nomor Induk Siswa (NIS)<input required value={nis} maxLength={40} autoComplete="username" placeholder="Masukkan NIS" onChange={e=>setNis(e.target.value)}/></label>
  <label>Token Pelajaran<input required value={token} maxLength={32} autoComplete="off" placeholder="Token dari pengawas" onChange={e=>setToken(e.target.value.toUpperCase())}/></label>
  <button type="submit" className="primary wide" disabled={busy}>{busy?'Memverifikasi…':'Masuk Ujian'}</button>
  {error&&<div className="alert" role="alert">{error}</div>}
  <p style={{fontSize:12}}>Satu NIS hanya dapat menggunakan satu sesi aktif untuk jadwal yang sama. Token tidak menggantikan pengawasan identitas siswa.</p>
 </form></main>;
 return <main style={{maxWidth:750,margin:'35px auto',padding:'0 18px'}}>
  <section className="panel"><div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',flexWrap:'wrap'}}>
   <div><h1 style={{margin:'0 0 5px'}}>CBT<span style={{color:'#078454'}}>Plus</span> — Peserta</h1><small>MA Plus Sunan Giri Salatiga</small></div>
   <div style={{display:'flex',gap:8}}><button type="button" className="outlinebutton" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/> Segarkan</button><button type="button" className="outlinebutton" onClick={()=>void logout()}><LogOut size={16}/> {info?.delivery_mode==='instant_form'?'Keluar (terkunci)':'Keluar'} Sesi</button></div>
  </div></section>
  {error&&<div className="alert" role="alert">{error}</div>}
  {busy&&!info&&<section className="panel">Memverifikasi sesi peserta…</section>}
  {info&&<section className="panel"><h2>Identitas Peserta</h2>
   <p><b>Nama:</b> {info.student_name}</p><p><b>NIS:</b> {info.nis}</p><p><b>Kelas:</b> {info.class_name}</p>
   <hr/><h3><BookOpen size={20} style={{verticalAlign:'middle'}}/> {info.subject_name}</h3>
   <p><b>Waktu:</b> {datetime(info.starts_at)} sampai {datetime(info.ends_at)}</p>
   <p><b>Jenis ujian:</b> {info.delivery_mode==='instant_form'?'Google Form (Mode Instan)':'CBT Internal'}</p>
   {!info.can_start&&<div className="infobox">Jadwal belum dimulai atau telah berakhir. Tekan Segarkan saat waktu ujian tiba.</div>}
   {info.delivery_mode==='instant_form'&&info.form_url&&info.can_start&&<div className="infobox">
     <p><b>Google Form tersedia.</b> Buka formulir pada sesi ujian sesuai arahan pengawas.</p>
     <a href={info.form_url} target="_blank" rel="noopener noreferrer" onClick={()=>void studentAction('form_opened')} className="outlinebutton" style={{display:'inline-flex',alignItems:'center',gap:8}}><ExternalLink size={18}/> Buka Google Form</a>
     <p><small>CBTPlus belum dapat memastikan Google Form sudah dikirim. Mintalah pengawas memverifikasi respons sebelum keluar.</small></p>
   </div>}
   {info.delivery_mode==='instant_form'&&<div className="panel" style={{border:'1px solid #b7d9ca',marginTop:18}}>
    <h3>Konfirmasi Selesai & Izin Keluar</h3>
    <p><b>Status siswa:</b> {info.student_progress==='menunggu_izin'?'Menunggu konfirmasi pengawas':info.student_progress==='form_dibuka'?'Form telah dibuka (belum terbukti dikirim)':'Belum membuka Google Form'}</p>
    <p><b>Verifikasi pengawas:</b> {info.supervisor_status==='selesai_dilaporkan'?'Selesai dikonfirmasi manual':'Belum dikonfirmasi'}</p>
    <p>Setelah klik <b>Kirim</b> pada Google Form, mintalah pengawas memeriksa respons di Google Forms/Sheets. CBTPlus tidak otomatis menerima bukti submit.</p>
    <button type="button" className="outlinebutton" disabled={busy||!info.student_progress||info.student_progress==='menunggu_izin'} onClick={()=>void studentAction('request_exit')}>Saya sudah kirim Form — Minta Izin Keluar</button>
    {info.student_progress==='menunggu_izin'&&<div style={{marginTop:12}}>
       <label>Token Izin Keluar dari Pengawas<input type="password" autoComplete="off" value={exitToken} onChange={e=>setExitToken(e.target.value.toUpperCase())} placeholder="Masukkan token izin"/></label>
       <button type="button" className="primary" disabled={busy||!exitToken.trim()} onClick={()=>void studentAction('exit',exitToken)}>Verifikasi Token & Keluar</button>
    </div>}
    <p><small>Di browser uji coba, menutup tab/berpindah aplikasi belum bisa diblokir. Pembatasan perangkat akan dibuat di APK/EXE.</small></p>
   </div>}
   {info.delivery_mode==='internal'&&<div className="infobox"><b>Login NIS + token berhasil.</b> Mesin pengerjaan CBT Internal perlu dihubungkan ke sesi siswa baru pada tahap berikutnya. Jangan gunakan portal ini untuk ujian CBT Internal resmi terlebih dahulu.</div>}
   <p><small>Versi pilot ini digunakan untuk pengujian login dan pengawasan. Pembatasan perpindahan aplikasi akan diterapkan pada APK/EXE.</small></p>
  </section>}
 </main>;
}
