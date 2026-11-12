import {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {Download,RefreshCw,ClipboardList,AlertTriangle,CheckCircle2} from 'lucide-react';
import {supabase} from './supabase';

type Period={id:string;title:string;academic_year:string;start_date:string;end_date:string;is_active:boolean};
type Student={id:string;nis:string;nisn:string|null;full_name:string;class_id:string;gender:string;status:string};
type Class={id:string;code:string;level:number};
type Room={id:string;name:string;location:string;capacity:number;sort_order:number};
type Assignment={id:string;student_id:string;period_id:string;room_id:string;seat_number:number};
type Subject={id:string;name:string};
type Bank={id:string;title:string;subject_id:string;class_id:string|null;owner_id:string};
type ExamSchedule={id:string;subject_id:string;class_id:string|null;bank_id:string|null;starts_at:string;ends_at:string;status:string};

type Props={period:Period|undefined;students:Student[];classes:Class[];rooms:Room[];assignments:Assignment[];subjects:Subject[];banks:Bank[];onNotice:(s:string)=>void};
const clean=(s:string)=>s.replace(/[\\/:*?\[\]]/g,'-').slice(0,31);
const save=(name:string,sheets:{name:string;rows:(string|number)[][]}[])=>{
 const book=XLSX.utils.book_new();
 for(const sheet of sheets){const ws=XLSX.utils.aoa_to_sheet(sheet.rows);ws['!cols']=sheet.rows[0]?.map((_,i)=>({wch:i===1?33: i===2?25:20}));XLSX.utils.book_append_sheet(book,ws,clean(sheet.name));}
 XLSX.writeFile(book,name);
};
const fmt=(iso:string)=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
export default function ExamAdministration({period,students,classes,rooms,assignments,subjects,banks,onNotice}:Props){
 const [schedules,setSchedules]=useState<ExamSchedule[]>([]);const [questionCounts,setQuestionCounts]=useState<Record<string,number>>({});const [loading,setLoading]=useState(false);
 const [roomFilter,setRoomFilter]=useState('all');
 const active=useMemo(()=>assignments.filter(a=>a.period_id===period?.id),[assignments,period?.id]);
 const studentMap=useMemo(()=>new Map(students.map(s=>[s.id,s])),[students]);
 const classMap=useMemo(()=>new Map(classes.map(c=>[c.id,c.code])),[classes]);
 const roomMap=useMemo(()=>new Map(rooms.map(r=>[r.id,r])),[rooms]);
 const bankMap=useMemo(()=>new Map(banks.map(b=>[b.id,b])),[banks]);
 const rows=useMemo(()=>active.map(a=>({a,s:studentMap.get(a.student_id),r:roomMap.get(a.room_id)})).filter(x=>x.s&&x.r).sort((a,b)=>(a.r!.sort_order-b.r!.sort_order)||(a.a.seat_number-b.a.seat_number)),[active,studentMap,roomMap]);
 const visible=rows.filter(x=>roomFilter==='all'||x.a.room_id===roomFilter);
 async function load(){if(!supabase||!period){setSchedules([]);setQuestionCounts({});return;}setLoading(true);
  try{const [sc,qs]=await Promise.all([supabase.from('exam_schedules').select('id,subject_id,class_id,bank_id,starts_at,ends_at,status').eq('period_id',period.id).order('starts_at'),supabase.from('questions').select('bank_id').limit(10000)]);
   if(sc.error)throw sc.error;if(qs.error)throw qs.error;
   setSchedules((sc.data||[]) as ExamSchedule[]);const counts:Record<string,number>={};for(const q of qs.data||[]){counts[q.bank_id]=(counts[q.bank_id]||0)+1;}setQuestionCounts(counts);
   if((qs.data||[]).length===10000)onNotice('Jumlah soal mencapai batas pembacaan 10.000; indikator jumlah soal perlu diperiksa lebih lanjut.');
  }catch(e){onNotice('Gagal memuat kesiapan ujian: '+(e instanceof Error?e.message:String(e)))}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[period?.id]);
 const assignedIds=new Set(active.map(a=>a.student_id));
 const eligible=students.filter(s=>s.status==='Aktif');
 const unassigned=eligible.filter(s=>!assignedIds.has(s.id));
 const overCapacity=rooms.filter(r=>active.filter(a=>a.room_id===r.id).length>r.capacity);
 const problems=schedules.flatMap(s=>{const messages:string[]=[];if(!s.bank_id)messages.push('Bank soal belum dipilih');else if(!(questionCounts[s.bank_id]>0))messages.push('Bank soal belum memiliki soal');if(s.status==='draft')messages.push('Masih draft');return messages.map(message=>({id:s.id,message,s}));});
 function exportRoster(){if(!period)return;save(`CBTPlus_Penempatan_${period.academic_year.replace('/','-')}.xlsx`,[{name:'Seluruh Peserta',rows:[['RUANG','NOMOR KURSI','NIS','NISN','NAMA PESERTA','KELAS ASAL','LOKASI'],...rows.map(({a,s,r})=>[r!.name,a.seat_number,s!.nis,s!.nisn||'',s!.full_name,classMap.get(s!.class_id)||'',r!.location])]}]);}
 function exportAttendance(){if(!period)return;const chosen=rooms.filter(r=>roomFilter==='all'||r.id===roomFilter);save(`CBTPlus_Daftar_Hadir_${period.academic_year.replace('/','-')}.xlsx`,chosen.map(r=>({name:r.name,rows:[['CBTPlus — DAFTAR HADIR PESERTA'],['PERIODE',`${period.title} ${period.academic_year}`],['RUANG',r.name],['LOKASI',r.location],['MAPEL / TANGGAL','________________________'],[],['NO. KURSI','NIS','NAMA PESERTA','KELAS','TANDA TANGAN','KETERANGAN'],...rows.filter(x=>x.r!.id===r.id).map(({a,s})=>[a.seat_number,s!.nis,s!.full_name,classMap.get(s!.class_id)||'','',''])]})));}
 function exportSeating(){if(!period)return;const chosen=rooms.filter(r=>roomFilter==='all'||r.id===roomFilter);save(`CBTPlus_Denah_Kursi_${period.academic_year.replace('/','-')}.xlsx`,chosen.map(r=>({name:r.name,rows:[['CBTPlus — DAFTAR KURSI'],['PERIODE',`${period.title} ${period.academic_year}`],['RUANG',r.name],['KAPASITAS',r.capacity],[],['KURSI','NAMA PESERTA','NIS','KELAS'],...rows.filter(x=>x.r!.id===r.id).map(({a,s})=>[a.seat_number,s!.full_name,s!.nis,classMap.get(s!.class_id)||''])]})));}
 return <>
 <div className="pageintro"><div><h2>Administrasi & Kesiapan Ujian</h2><p>Unduh daftar hadir, daftar ruang, daftar kursi, dan periksa kesiapan bank soal.</p></div><button className="outlinebutton" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> {loading?'Memuat…':'Perbarui Pemeriksaan'}</button></div>
 {!period?<div className="panel">Belum ada periode ujian. Aktifkan periode melalui Pengaturan.</div>:<>
 <div className="schedule-metrics"><div className="panel"><b>{eligible.length}</b><small>Peserta aktif</small></div><div className="panel"><b>{active.length}</b><small>Penempatan periode</small></div><div className="panel"><b>{schedules.length}</b><small>Jadwal ujian</small></div></div>
 <section className="panel"><div className="sectiontitle"><ClipboardList/><div><h3>Dokumen administrasi</h3><p>Data diambil dari periode aktif: {period.title} {period.academic_year}. File dapat diedit dan dicetak dari Excel.</p></div></div>
 <div className="formgrid"><label>Filter ruang<select value={roomFilter} onChange={e=>setRoomFilter(e.target.value)}><option value="all">Semua ruang</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name} — {r.location}</option>)}</select></label></div>
 <div className="importrow"><button className="outlinebutton" disabled={!rows.length} onClick={exportRoster}><Download size={16}/> Ekspor Penempatan Semua Ruang</button><button className="outlinebutton" disabled={!rows.length} onClick={exportAttendance}><Download size={16}/> Daftar Hadir Excel</button><button className="outlinebutton" disabled={!rows.length} onClick={exportSeating}><Download size={16}/> Daftar Kursi Excel</button></div>
 <div className="infobox">Daftar hadir dan kursi mengikuti penempatan yang tetap selama periode ujian. Admin dapat mengubah penempatan di menu Ruang & Penempatan; ekspor ulang setelah perubahan. File daftar kursi adalah daftar urut, bukan denah posisi meja fisik.</div>
 <div className="scrolltable"><table><thead><tr><th>Ruang</th><th>Kursi</th><th>NIS</th><th>Nama</th><th>Kelas asal</th></tr></thead><tbody>{visible.map(({a,s,r})=><tr key={a.id}><td>{r!.name}</td><td>{a.seat_number}</td><td>{s!.nis}</td><td>{s!.full_name}</td><td>{classMap.get(s!.class_id)}</td></tr>)}{!visible.length&&<tr><td colSpan={5} className="empty">Belum ada peserta ditempatkan dalam ruang ini.</td></tr>}</tbody></table></div></section>
 <section className="panel"><h3>Pemeriksaan kesiapan</h3><p>Hasil ini bersifat pemeriksaan administrasi, bukan pengganti uji teknis aplikasi siswa dan server.</p>
 <div className="statusrow">{unassigned.length?<AlertTriangle/>:<CheckCircle2/>} {unassigned.length?`${unassigned.length} siswa aktif belum mendapat ruang`:'Semua siswa aktif telah memiliki ruang'}</div>
 <div className="statusrow">{overCapacity.length?<AlertTriangle/>:<CheckCircle2/>} {overCapacity.length?`${overCapacity.length} ruang melebihi kapasitas`:'Tidak ada ruang melebihi kapasitas'}</div>
 <div className="statusrow">{schedules.length?<CheckCircle2/>:<AlertTriangle/>} {schedules.length?`${schedules.length} jadwal tersedia`:'Belum ada jadwal ujian'}</div>
 {schedules.map(s=>{const bank=s.bank_id?bankMap.get(s.bank_id):null;const subject=subjects.find(x=>x.id===s.subject_id)?.name||'-';const classroom=classMap.get(s.class_id||'')||'-';const count=s.bank_id?questionCounts[s.bank_id]||0:0;const ready=Boolean(bank&&count&&s.status==='published');return <div className="statusrow" key={s.id}>{ready?<CheckCircle2/>:<AlertTriangle/>}<span><b>{subject} — {classroom}</b> • {fmt(s.starts_at)} • {s.status} • {bank?`${count} soal (${bank.title})`:'Belum ada bank soal'}</span></div>})}
 {problems.length>0&&<div className="infobox">Perlu ditindaklanjuti: {problems.length} catatan pada jadwal. Lengkapi bank soal dan terbitkan sesi pada menu Jadwal Ujian setelah diperiksa.</div>}
 </section>
 </>}
 </>;
}
