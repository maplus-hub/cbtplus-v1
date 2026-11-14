import {useEffect,useState,type FormEvent} from 'react';
import {supabase} from './supabase';

type Student={id:string;nis:string;nisn:string|null;full_name:string;class_id:string;gender:string;birth_date:string|null;status:string;notes:string};
type Class={id:string;code:string};
type Assignment={student_id:string;period_id:string};
type Props={student:Student|null;classes:Class[];assignments:Assignment[];isAdmin:boolean;onClose:()=>void;onReload:()=>Promise<void>;onNotice:(value:string)=>void};
export default function StudentEditPanel({student,classes,assignments,isAdmin,onClose,onReload,onNotice}:Props){
 const [form,setForm]=useState<Student|null>(null);
 const [busy,setBusy]=useState(false);
 useEffect(()=>setForm(student?{...student}:null),[student]);
 if(!student||!form)return null;
 const update=(value:Partial<Student>)=>setForm(prev=>prev?{...prev,...value}:prev);
 async function save(e:FormEvent){
  e.preventDefault();if(!supabase||!isAdmin||!student||!form||busy)return;
  const currentStudent=student;
  const currentForm=form;
  if(!currentForm.nis.trim()||!currentForm.full_name.trim()||!currentForm.class_id){onNotice('NIS, nama dan kelas wajib diisi.');return}
  setBusy(true);
  const {error}=await supabase.from('students').update({nis:currentForm.nis.trim(),nisn:currentForm.nisn?.trim()||null,full_name:currentForm.full_name.trim(),class_id:currentForm.class_id,gender:currentForm.gender,birth_date:currentForm.birth_date||null,status:currentForm.status,notes:currentForm.notes||'',updated_at:new Date().toISOString()}).eq('id',currentStudent.id);
  setBusy(false);
  if(error){onNotice('Gagal edit siswa: '+error.message);return}
  onNotice('Data siswa diperbarui.');onClose();await onReload();
 }
 async function remove(){
  if(!supabase||!isAdmin||!student||busy)return;
  const currentStudent=student;
  if(assignments.some(a=>a.student_id===currentStudent.id)){onNotice('Hapus ditolak: siswa sudah punya penempatan ruang. Gunakan status Nonaktif atau pindahkan/bersihkan relasi melalui prosedur admin.');return}
  const {count,error:countError}=await supabase.from('exam_attempts').select('id',{count:'exact',head:true}).eq('student_id',currentStudent.id);
  if(countError){onNotice('Belum dapat memverifikasi riwayat ujian: '+countError.message);return}
  if((count??0)>0){onNotice('Hapus ditolak: siswa memiliki riwayat pengerjaan ujian. Gunakan status Nonaktif.');return}
  if(!window.confirm(`HAPUS PERMANEN siswa ${currentStudent.full_name} (${currentStudent.nis})? Data yang berelasi dapat terpengaruh. Tindakan ini tidak dapat dibatalkan.`))return;
  setBusy(true);
  const {error}=await supabase.from('students').delete().eq('id',currentStudent.id);
  setBusy(false);
  if(error){onNotice('Gagal menghapus siswa: '+error.message);return}
  onNotice('Siswa dihapus.');onClose();await onReload();
 }
 return <section className="panel" style={{border:'2px solid #0a7e56'}} aria-label="Edit data siswa">
   <div className="panelhead"><div><h3>Edit / Hapus Siswa</h3><p>Perubahan NIS dapat memengaruhi identitas login siswa di masa depan.</p></div><button className="outlinebutton" type="button" onClick={onClose}>Tutup</button></div>
   <form className="formgrid" onSubmit={save}>
    <label>NIS *<input required value={form.nis} onChange={e=>update({nis:e.target.value})}/></label>
    <label>NISN<input value={form.nisn??''} onChange={e=>update({nisn:e.target.value})}/></label>
    <label>Nama lengkap *<input required value={form.full_name} onChange={e=>update({full_name:e.target.value})}/></label>
    <label>Kelas *<select required value={form.class_id} onChange={e=>update({class_id:e.target.value})}>{classes.map(c=><option value={c.id} key={c.id}>{c.code}</option>)}</select></label>
    <label>Jenis kelamin<select value={form.gender} onChange={e=>update({gender:e.target.value})}><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>
    <label>Tanggal lahir<input type="date" value={form.birth_date??''} onChange={e=>update({birth_date:e.target.value||null})}/></label>
    <label>Status<select value={form.status} onChange={e=>update({status:e.target.value})}><option>Aktif</option><option>Nonaktif</option></select></label>
    <label>Catatan<input value={form.notes??''} onChange={e=>update({notes:e.target.value})}/></label>
    <button className="primary" type="submit" disabled={!isAdmin||busy}>{busy?'Memproses…':'Simpan Perubahan'}</button>
    <button className="outlinebutton" type="button" disabled={!isAdmin||busy} onClick={()=>void remove()} style={{color:'#a32222'}}>Hapus Siswa</button>
   </form>
 </section>;
}
