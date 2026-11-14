import {useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';

type Period={id:string;title:string;academic_year:string;is_active:boolean};
type Room={id:string;name:string;location:string};
type Schedule={id:string;period_id:string;class_id:string;subject_id:string;status:string;starts_at:string;ends_at:string};
type Item={id:string;name?:string;code?:string};
type Options={periods:Period[];rooms:Room[];schedules:Schedule[];subjects:Item[];classes:Item[]};
const API=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-center`;
async function call(op:string,args:Record<string,unknown>={}){
  const {data}=await supabase!.auth.getSession();
  const jwt=data.session?.access_token;
  if(!jwt)throw Error('Silakan login ulang sebagai admin');
  const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_ANON_KEY,'Authorization':`Bearer ${jwt}`},body:JSON.stringify({op,...args})});
  const result=await response.json();if(!response.ok)throw Error(result.error||`HTTP ${response.status}`);return result;
}
export default function TokenCenterAdmin(){
  const [options,setOptions]=useState<Options|null>(null),[period,setPeriod]=useState(''),[room,setRoom]=useState(''),[schedule,setSchedule]=useState('');
  const [token,setToken]=useState(''),[tokenKind,setTokenKind]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{void call('admin_options').then((o:Options)=>{setOptions(o);setPeriod(o.periods.find(p=>p.is_active)?.id||o.periods[0]?.id||'');setRoom(o.rooms[0]?.id||'')}).catch(e=>setMessage(e.message))},[]);
  const schedules=useMemo(()=>options?.schedules.filter(s=>s.period_id===period&&s.status==='published')||[],[options,period]);
  const subjectName=(id:string)=>options?.subjects.find(s=>s.id===id)?.name||id;
  const className=(id:string)=>options?.classes.find(s=>s.id===id)?.code||id;
  async function issue(kind:'supervisor'|'lesson'){
    setBusy(true);setMessage('');setToken('');
    try {
      if(kind==='supervisor'&&(!period||!room))throw Error('Pilih periode dan ruang');
      if(kind==='lesson'&&!schedule)throw Error('Pilih jadwal yang sudah diterbitkan');
      if(!window.confirm(kind==='supervisor'?'Terbitkan token baru? Token login pengawas dan sesinya yang lama akan dinonaktifkan.':'Buat token pelajaran baru? Token sebelumnya segera tidak berlaku.'))return;
      const result=kind==='supervisor'?await call('admin_issue_supervisor',{period_id:period,room_id:room}):await call('admin_issue_lesson',{schedule_id:schedule});
      setToken(result.token);setTokenKind(kind==='supervisor'?'Token Login Pengawas':'Token Pelajaran');
      setMessage('Token berhasil dibuat. Simpan dan bagikan hanya kepada pihak yang berhak.');
    }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  return <div>
    <div className="pageintro"><div><h2>Pusat Token Ujian</h2><p>Admin menerbitkan token pengawas per ruang/periode dan token pelajaran per jadwal kelas.</p></div></div>
    <section className="panel"><h3>1. Token Login Pengawas</h3>
      <p>Token ini digunakan untuk masuk ke Dashboard Pengawas. Rotasi token membatalkan sesi pengawas yang lama.</p>
      <div className="formgrid">
        <label>Periode<select value={period} onChange={e=>{setPeriod(e.target.value);setSchedule('')}}><option value="">Pilih periode</option>{options?.periods.map(p=><option value={p.id} key={p.id}>{p.title} — {p.academic_year}</option>)}</select></label>
        <label>Ruang<select value={room} onChange={e=>setRoom(e.target.value)}><option value="">Pilih ruang</option>{options?.rooms.map(r=><option value={r.id} key={r.id}>{r.name} — {r.location}</option>)}</select></label>
        <button className="primary" type="button" disabled={busy||!period||!room} onClick={()=>void issue('supervisor')}>Generate Token Pengawas</button>
      </div>
    </section>
    <section className="panel"><h3>2. Token Pelajaran (per jadwal dan rombel)</h3>
      <p>Di ruang campuran kelas, pengawas otomatis melihat beberapa token berdasarkan kelas para peserta di ruangnya.</p>
      <div className="formgrid"><label>Jadwal terbit<select value={schedule} onChange={e=>setSchedule(e.target.value)}><option value="">Pilih jadwal ujian</option>
        {schedules.map(s=><option key={s.id} value={s.id}>{className(s.class_id)} — {subjectName(s.subject_id)} — {new Date(s.starts_at).toLocaleString('id-ID')}</option>)}
      </select></label>
        <button type="button" className="primary" disabled={busy||!schedule} onClick={()=>void issue('lesson')}>Generate Token Pelajaran</button>
      </div>
      {period&&!schedules.length&&<div className="infobox">Belum ada jadwal terbit pada periode ini. Terbitkan jadwal melalui menu Jadwal Ujian terlebih dahulu.</div>}
    </section>
    {token&&<section className="panel"><h3>{tokenKind} — Baru Diterbitkan</h3>
      <p>Token ditampilkan saat pembuatan. Jangan menaruhnya di repo GitHub atau membagikan token pengawas kepada siswa.</p>
      <div style={{fontSize:26,fontWeight:800,letterSpacing:3,margin:'12px 0'}}>{token}</div>
      <button type="button" className="outlinebutton" onClick={()=>void navigator.clipboard.writeText(token)}>Salin Token</button>
    </section>}
    {message&&<div className="infobox" role="status">{message}</div>}
    <section className="panel"><h3>Dashboard Pengawas</h3>
      <p>Untuk tahap uji v1.8.1, antarmuka pengawas tersedia di <code>?portal=pengawas</code>. Komponen yang sama akan dipakai dalam APK Android pengawas. Aplikasi siswa ditargetkan APK Android dan EXE Windows.</p>
    </section>
  </div>
}
