import fs from 'node:fs';
const path='src/App.tsx';
if(!fs.existsSync(path))throw Error('Jalankan dari root proyek cbtplus-v1');
let app=fs.readFileSync(path,'utf8');
if(app.includes("import RoomQuickAssign from './RoomQuickAssign';")){
 console.log('Integrasi v1.8.2 sudah ada; tidak diubah.'); process.exit(0);
}
const replaceOnce=(from,to,label)=>{
 const n=app.split(from).length-1;
 if(n!==1)throw Error(`Tidak jadi mengubah App.tsx: penanda ${label} ditemukan ${n} kali (harus 1).`);
 app=app.replace(from,to);
};
replaceOnce("import SettingsManager from './SettingsManager';", "import SettingsManager from './SettingsManager';\nimport StudentEditPanel from './StudentEditPanel';\nimport RoomQuickAssign from './RoomQuickAssign';",'import');
replaceOnce("const [newRoomName,setNewRoomName]", "const [editingStudent,setEditingStudent]=useState<Student|null>(null);\n const [newRoomName,setNewRoomName]", 'state siswa');
replaceOnce('<th>Status</th><th>Ruang</th></tr></thead><tbody>{filtered.map', '<th>Status</th><th>Ruang</th><th>Aksi</th></tr></thead><tbody>{filtered.map','kolom siswa');
replaceOnce("?.name||'Belum ditempatkan'}</td></tr>)}{!filtered.length", "?.name||'Belum ditempatkan'}</td><td><button type=\"button\" className=\"outlinebutton\" disabled={!isAdmin} onClick={()=>setEditingStudent(s)}>Edit / Hapus</button></td></tr>)}{!filtered.length", 'tombol siswa');
replaceOnce('<td colSpan={6} className="empty">Belum ada siswa.', '<td colSpan={7} className="empty">Belum ada siswa.', 'colspan');
replaceOnce("</tbody></table></div></section></>}\n {tab==='ruang'", "</tbody></table></div></section><StudentEditPanel student={editingStudent} classes={classes} assignments={assignments} isAdmin={isAdmin} onClose={()=>setEditingStudent(null)} onReload={loadData} onNotice={flash}/></>}\n {tab==='ruang'", 'form edit siswa');
replaceOnce('<section className="panel"><h3>Daftar Penempatan</h3>', '<RoomQuickAssign period={activePeriod} students={students} classes={classes} rooms={rooms} assignments={assignments} isAdmin={isAdmin} onNotice={flash} onReload={loadData}/><section className="panel"><h3>Daftar Penempatan</h3>', 'bulk room');
fs.copyFileSync(path,path+'.before-v182.bak');
fs.writeFileSync(path,app);
console.log('Integrasi v1.8.2 berhasil. Backup App.tsx.before-v182.bak.');
