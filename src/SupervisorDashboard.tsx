import {useEffect,useState} from 'react';
import './style.css';
const URL=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-center`;
async function action(op:string,args:Record<string,unknown>={}){
  const response=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_ANON_KEY,'Authorization':`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},body:JSON.stringify({op,...args})});
  const body=await response.json();if(!response.ok)throw Error(body.error||`HTTP ${response.status}`);return body;
}
type Schedule={id:string;class_id:string;class_name:string;subject_name:string;token:string|null;starts_at:string;ends_at:string;student_count:number};
type Student={id:string;nis:string;full_name:string;class_id:string;status:string};
type Attempt={id:string;student_id:string;schedule_id:string;status:string};
type Overview={room_name:string;period_title:string;label:string;expires_at:string;schedules:Schedule[];pupils:Student[];attempts:Attempt[];override_token:string|null;override_rotated_at:string|null};
export default function SupervisorDashboard(){
  const [loginToken,setLoginToken]=useState(''),[session,setSession]=useState(()=>sessionStorage.getItem('cbtplus-supervisor')||'');
  const [examDate,setExamDate]=useState(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),[data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=async(s=session)=>{setError('');try{const x=await action('supervisor_overview',{session:s,exam_date:examDate});setData(x)}catch(e){setData(null);setError(e instanceof Error?e.message:String(e))}};
  useEffect(()=>{if(session)void refresh(session)},[session,examDate]);
  async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const result=await action('supervisor_login',{token:loginToken.trim().toUpperCase()});
    sessionStorage.setItem('cbtplus-supervisor',result.session_token);setLoginToken('');setSession(result.session_token);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  async function rotate(){if(!window.confirm('Perbarui token keluar dan buka kunci? Token lama langsung tidak berlaku.'))return;setBusy(true);try{await action('supervisor_rotate',{session});await refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  async function lock(id:string){if(!window.confirm('Kunci pengerjaan siswa ini? Siswa perlu token pengawas untuk membuka kembali.'))return;setBusy(true);try{await action('supervisor_lock',{session,attempt_id:id});await refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  function logout(){sessionStorage.removeItem('cbtplus-supervisor');setSession('');setData(null);setError('')}
  const logoutButton=<button type="button" className="outlinebutton" onClick={logout}>Keluar Dashboard Pengawas</button>;
  if(!session)return <div className="centerpage"><form className="authbox" onSubmit={login}>
    <div className="brandmark">SG</div><h1>CBT<span>Plus</span></h1><h2>Login Pengawas</h2><p>MA Plus Sunan Giri Salatiga</p>
    <label>Token Login Pengawas<input type="password" required autoComplete="off" value={loginToken} onChange={e=>setLoginToken(e.target.value)} placeholder="Token dari admin"/></label>
    <button className="primary wide" type="submit" disabled={busy}>{busy?'Memeriksa…':'Masuk Dashboard Pengawas'}</button>
    {error&&<div className="alert" role="alert">{error}</div>}
  </form></div>;
  return <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 16px'}}>
    <div className="pageintro"><div><h1>CBTPlus — Dashboard Pengawas</h1><p>{data?`${data.room_name} • ${data.period_title}`:'Memuat data ruang…'}</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="outlinebutton" onClick={()=>void refresh()}>Muat Ulang</button>{logoutButton}</div></div>
    <section className="panel"><label>Tanggal ujian (WIB) <input type="date" value={examDate} onChange={e=>setExamDate(e.target.value)}/></label></section>
    {error&&<div className="alert" role="alert">{error}</div>}
    {data&&<>
      <section className="panel"><h3>Token Pelajaran untuk Ruang Ini</h3>
        <p>Token muncul sesuai jadwal terbit dan kelas peserta yang menempati ruang ini. Jadwal yang berbeda memiliki token yang berbeda.</p>
        <div className="roomgrid">{data.schedules.map(s=><div className="roomcard" key={s.id}>
          <strong>Kelas {s.class_name}</strong><h3>{s.subject_name}</h3>
          <p>{new Date(s.starts_at).toLocaleString('id-ID')} — {new Date(s.ends_at).toLocaleTimeString('id-ID')}</p>
          <div style={{fontWeight:800,fontSize:23,letterSpacing:2,margin:'12px 0'}}>{s.token||'Belum digenerate'}</div>
          <small>{s.student_count} peserta terdaftar di ruang</small>
        </div>)}{!data.schedules.length&&<p>Belum ada jadwal terbit untuk kelas-kelas di ruang ini.</p>}</div>
      </section>
      <section className="panel"><h3>Token Keluar / Buka Kunci</h3>
        <p>Dikelola pengawas. Token lama langsung tidak berlaku setelah diganti. Jangan berikan token ini secara massal kepada siswa.</p>
        <div style={{fontSize:25,fontWeight:800,letterSpacing:2,margin:'12px 0'}}>{data.override_token||'Belum dibuat'}</div>
        {data.override_rotated_at&&<small>Terakhir diubah: {new Date(data.override_rotated_at).toLocaleString('id-ID')}</small>}
        <div style={{marginTop:16}}><button className="primary" disabled={busy} onClick={()=>void rotate()}>Generate / Perbarui Token Izin</button></div>
      </section>
      <section className="panel"><h3>Monitoring Pengerjaan Peserta</h3>
        <div className="scrolltable"><table><thead><tr><th>NIS</th><th>Nama</th><th>Kelas</th><th>Pelajaran</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>
          {data.pupils.map(p=>{
            const belonging=data.schedules.filter(s=>s.class_id===p.class_id);
            return belonging.map(s=>{
              const a=data.attempts.find(a=>a.student_id===p.id&&a.schedule_id===s.id);
              return <tr key={p.id+'-'+s.id}><td>{p.nis}</td><td>{p.full_name}</td><td>{s.class_name}</td><td>{s.subject_name}</td><td>{a?.status||'belum_mulai'}</td>
                <td>{a?.status==='mengerjakan'?<button type="button" className="outlinebutton" disabled={busy} onClick={()=>void lock(a.id)}>Kunci</button>:a?.status==='terkunci'?'Berikan token izin untuk membuka':a?.status==='selesai'?'Selesai':'—'}</td></tr>;
            });
          })}
        </tbody></table></div>
      </section>
    </>}
  </div>;
}
