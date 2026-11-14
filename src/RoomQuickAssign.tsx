import {useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';

type Student={id:string;nis:string;full_name:string;class_id:string;status:string};
type Class={id:string;code:string};
type Room={id:string;name:string;capacity:number};
type Assignment={student_id:string;period_id:string;room_id:string;seat_number:number};
type Period={id:string;title:string};
type Props={period:Period|undefined;students:Student[];classes:Class[];rooms:Room[];assignments:Assignment[];isAdmin:boolean;onNotice:(message:string)=>void;onReload:()=>Promise<void>};
export default function RoomQuickAssign({period,students,classes,rooms,assignments,isAdmin,onNotice,onReload}:Props){
 const [roomId,setRoomId]=useState('');const [selected,setSelected]=useState<string[]>([]);const [filter,setFilter]=useState('');const [classId,setClassId]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{setSelected([])},[period?.id,roomId]);
 const current=useMemo(()=>assignments.filter(a=>a.period_id===period?.id),[assignments,period?.id]);
 const byStudent=useMemo(()=>new Map(current.map(a=>[a.student_id,a])),[current]);
 const visible=useMemo(()=>students.filter(s=>s.status==='Aktif'&&(!classId||s.class_id===classId)&&`${s.nis} ${s.full_name}`.toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>a.full_name.localeCompare(b.full_name,'id')),[students,classId,filter]);
 const target=rooms.find(r=>r.id===roomId);
 const occupied=current.filter(a=>a.room_id===roomId);
 const moving=selected.filter(id=>byStudent.get(id)?.room_id!==roomId);
 const free=(target?.capacity??0)-occupied.length;
 const toggle=(id:string,on:boolean)=>setSelected(prev=>on?[...new Set([...prev,id])]:prev.filter(v=>v!==id));
 async function save(){
  if(!supabase||!period||!isAdmin||!roomId||!selected.length||busy)return;
  if(moving.length>free){onNotice(`Tidak cukup kursi: perlu ${moving.length}, tersedia ${free}.`);return}
  if(!window.confirm(`Tetapkan ${selected.length} siswa ke ${target?.name}? Kursi baru diisi otomatis berurutan dari yang tersedia.`))return;
  setBusy(true);
  const ordered=visible.filter(s=>selected.includes(s.id)).map(s=>s.id);
  // Add selected students outside the current filter deterministically.
  selected.forEach(id=>{if(!ordered.includes(id))ordered.push(id)});
  const {data,error}=await supabase.rpc('assign_students_room_bulk_v182',{p_period:period.id,p_room:roomId,p_students:ordered});
  setBusy(false);
  if(error){onNotice('Gagal menyimpan penempatan: '+error.message);return}
  onNotice(`${data} penempatan berhasil diperbarui; nomor kursi diisi otomatis.`);setSelected([]);await onReload();
 }
 return <section className="panel">
  <div className="panelhead"><div><h3>Penempatan Cepat — Centang Nama Siswa</h3><p>Pilih ruang, centang siswa, lalu simpan. Nomor kursi otomatis 1, 2, 3, ... pada kursi yang tersedia.</p></div></div>
  <div className="formgrid">
   <label>Ruang tujuan<select value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">-- Pilih ruang --</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name} (kapasitas {r.capacity})</option>)}</select></label>
   <label>Filter kelas<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Semua kelas</option>{classes.map(c=><option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
   <label>Cari nama / NIS<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Cari peserta"/></label>
  </div>
  {roomId&&<div className="infobox">{target?.name}: {occupied.length}/{target?.capacity} terisi · {free} kursi kosong · {selected.length} siswa dipilih ({moving.length} perlu kursi baru).</div>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0'}}>
   <button type="button" className="outlinebutton" onClick={()=>setSelected(prev=>[...new Set([...prev,...visible.map(s=>s.id)])])} disabled={!roomId||!isAdmin}>Centang semua hasil filter</button>
   <button type="button" className="outlinebutton" onClick={()=>setSelected(prev=>prev.filter(id=>!visible.some(s=>s.id===id)))} disabled={!roomId||!isAdmin}>Hapus centang hasil filter</button>
   <button type="button" className="outlinebutton" onClick={()=>setSelected([])}>Kosongkan pilihan</button>
  </div>
  <div className="scrolltable" style={{maxHeight:360,overflowY:'auto'}}><table><thead><tr><th>Pilih</th><th>NIS</th><th>Nama</th><th>Kelas</th><th>Ruang sekarang</th><th>Kursi</th></tr></thead><tbody>{visible.map(s=>{const old=byStudent.get(s.id);return <tr key={s.id}><td><input type="checkbox" aria-label={`Pilih ${s.full_name}`} checked={selected.includes(s.id)} disabled={!roomId||!isAdmin||busy} onChange={e=>toggle(s.id,e.target.checked)}/></td><td>{s.nis}</td><td>{s.full_name}</td><td>{classes.find(c=>c.id===s.class_id)?.code??'-'}</td><td>{rooms.find(r=>r.id===old?.room_id)?.name??'Belum ditempatkan'}</td><td>{old?.seat_number??'-'}</td></tr>})}</tbody></table></div>
  <button className="primary" style={{marginTop:12}} type="button" onClick={()=>void save()} disabled={!isAdmin||!roomId||!selected.length||busy||moving.length>free}>{busy?'Menyimpan…':`Simpan ${selected.length} Siswa — Kursi Otomatis`}</button>
  <p style={{fontSize:12,marginTop:8}}>Pindah ruang hanya untuk periode terpilih; ruang peserta tidak berubah pada hari ujian lain. Siswa dengan riwayat ujian tidak dapat dipindahkan setelah pengerjaan dimulai.</p>
 </section>;
}
