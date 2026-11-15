import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const sentinel='CBTPLUS_INSTANT_FORM_V186';
function patch(relative, transforms){
  const p=path.join(root,relative);
  if(!fs.existsSync(p))throw new Error(`${relative} tidak ada. Jalankan dari folder proyek CBTPlus.`);
  let source=fs.readFileSync(p,'utf8');
  if(source.includes(sentinel)){console.log(`Sudah terpasang: ${relative}`);return;}
  let updated=source;
  for(const [find,replacement,label] of transforms){
    const count=updated.split(find).length-1;
    if(count!==1)throw new Error(`${relative}: anchor ${label} diharapkan 1, ditemukan ${count}. File TIDAK diubah; kirim pesan ini untuk penyesuaian patch.`);
    updated=updated.replace(find,replacement);
  }
  const backup=p+'.before-v186.bak';
  if(!fs.existsSync(backup))fs.copyFileSync(p,backup);
  fs.writeFileSync(p,updated);
  console.log(`OK ${relative} (backup: ${path.basename(backup)})`);
}

const bankType=`type Bank={id:string;title:string;subject_id:string;class_id:string|null;owner_id:string};`;
const bankTypeNew=`// ${sentinel}\ntype Bank={id:string;title:string;subject_id:string;class_id:string|null;owner_id:string;delivery_mode?:'internal'|'instant_form';form_url?:string|null};`;
const bankStates=`const [newBankTitle,setNewBankTitle]=useState(''),[newBankSubject,setNewBankSubject]=useState(''),[newBankClasses,setNewBankClasses]=useState<string[]>([]);`;
const bankStatesNew=bankStates+`\n const [newBankMode,setNewBankMode]=useState<'internal'|'instant_form'>('internal'),[newBankUrl,setNewBankUrl]=useState('');`;
const oldRpc=`supabase.rpc('save_bank_with_classes',{p_bank_id:`;
const newRpc=`supabase.rpc('save_bank_with_classes_instant',{p_bank_id:`;
const oldEdit=`p_class_ids:newBankClasses});`;
const newEdit=`p_class_ids:newBankClasses,p_delivery_mode:newBankMode,p_form_url:newBankMode==='instant_form'?newBankUrl.trim():null});`;
const oldReset=`setNewBankClasses([]);flash('Bank soal berhasil diperbarui');`;
const newReset=`setNewBankClasses([]);setNewBankMode('internal');setNewBankUrl('');flash('Bank soal berhasil diperbarui');`;
const oldStart=`setNewBankClasses(bankClassTargets[bank.id]??(bank.class_id?[bank.class_id]:[]))}`;
const newStart=`setNewBankClasses(bankClassTargets[bank.id]??(bank.class_id?[bank.class_id]:[]));setNewBankMode(bank.delivery_mode==='instant_form'?'instant_form':'internal');setNewBankUrl(bank.form_url||'')}`;
const oldCreated=`flash('Bank soal dibuat. Klik judul bank untuk membuka editor soal.');setNewBankTitle('');setNewBankClasses([]);`;
const newCreated=`flash(newBankMode==='instant_form'?'Bank instan dibuat. Gunakan Buka Form untuk memeriksa tautannya.':'Bank soal dibuat. Klik judul bank untuk membuka editor soal.');setNewBankTitle('');setNewBankClasses([]);setNewBankMode('internal');setNewBankUrl('');`;
const endField=`</fieldset><button type="submit" className="primary"><Plus size={17}/>{editingBank?'Simpan Perubahan':'Buat Bank'}</button>`;
const formFields=`</fieldset><fieldset className="bank-class-targets"><legend>Mode bank soal</legend><label className="bank-class-choice"><input type="radio" name="bank-delivery-mode" checked={newBankMode==='internal'} onChange={()=>setNewBankMode('internal')}/> CBT Internal (input soal di CBTPlus)</label><label className="bank-class-choice"><input type="radio" name="bank-delivery-mode" checked={newBankMode==='instant_form'} onChange={()=>setNewBankMode('instant_form')}/> Instan — Google Form (tanpa input soal)</label>{newBankMode==='instant_form'&&<label>Link Google Form untuk responden<input type="url" required value={newBankUrl} onChange={e=>setNewBankUrl(e.target.value)} placeholder="https://docs.google.com/forms/d/e/.../viewform"/><small>Gunakan link pengisian, bukan link editor. Nilai Google Form tidak otomatis masuk CBTPlus.</small></label>}</fieldset><button type="submit" className="primary"><Plus size={17}/>{editingBank?'Simpan Perubahan':'Buat Bank'}</button>`;
const listOld=`<td><button type="button" className="bank-open" onClick={()=>setSelectedBankId(b.id)}><BookOpen size={15}/>{b.title}</button></td>`;
const listNew=`<td>{b.delivery_mode==='instant_form'?<><b>{b.title}</b> <span className="tag green">Instan · Google Form</span>{b.form_url&&<a className="outlinebutton" target="_blank" rel="noopener noreferrer" href={b.form_url}>Buka Form</a>}</>:<button type="button" className="bank-open" onClick={()=>setSelectedBankId(b.id)}><BookOpen size={15}/>{b.title}</button>}</td>`;
const infoOld=`Klik nama bank soal untuk membuka editor PG, MCMA, kategori, dan esai. Kunci jawaban tersimpan secara terpisah.`;
const infoNew=`Bank CBT Internal menggunakan editor PG, MCMA, kategori, dan esai. Bank Instan membuka Google Form eksternal; respons dan nilai tidak otomatis masuk CBTPlus. Token CBTPlus tidak membatasi akses langsung ke link Google Form.`;

patch('src/App.tsx',[
 [bankType,bankTypeNew,'tipe Bank'],
 [bankStates,bankStatesNew,'state bank'],
 [`supabase.rpc('save_bank_with_classes',{p_bank_id:editingBank,p_title:newBankTitle.trim(),p_subject_id:newBankSubject,p_class_ids:newBankClasses});`,`supabase.rpc('save_bank_with_classes_instant',{p_bank_id:editingBank,p_title:newBankTitle.trim(),p_subject_id:newBankSubject,p_class_ids:newBankClasses,p_delivery_mode:newBankMode,p_form_url:newBankMode==='instant_form'?newBankUrl.trim():null});`,'rpc edit'],
 [`supabase.rpc('save_bank_with_classes',{p_bank_id:null,p_title:newBankTitle.trim(),p_subject_id:newBankSubject,p_class_ids:newBankClasses});`,`supabase.rpc('save_bank_with_classes_instant',{p_bank_id:null,p_title:newBankTitle.trim(),p_subject_id:newBankSubject,p_class_ids:newBankClasses,p_delivery_mode:newBankMode,p_form_url:newBankMode==='instant_form'?newBankUrl.trim():null});`,'rpc create'],
 [oldReset,newReset,'reset editor'],
 [oldStart,newStart,'start edit'],
 [oldCreated,newCreated,'created'],
 [endField,formFields,'mode selector'],
 [listOld,listNew,'list instant'],
 [infoOld,infoNew,'info']
]);

patch('src/ScheduleManager.tsx',[
 [bankType,bankTypeNew,'tipe Bank'],
 [`<td>{banks.find(b=>b.id===row.bank_id)?.title||'Belum dipilih'}</td>`,`<td>{banks.find(b=>b.id===row.bank_id)?.title||'Belum dipilih'}{banks.find(b=>b.id===row.bank_id)?.delivery_mode==='instant_form'&&<><br/><span className="tag green">Google Form · nilai eksternal</span></>}</td>`,'label mode jadwal'],
 [`{banks.filter(b=>acceptsBank(b,row.subject_id,row.class_id)).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}`,`{banks.filter(b=>acceptsBank(b,row.subject_id,row.class_id)).map(b=><option key={b.id} value={b.id}>{b.title}{b.delivery_mode==='instant_form'?' (Google Form)':''}</option>)}`,'dropdown jadwal'],
 [`{banks.filter(b=>acceptsBank(b,editSubject,editClass)).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}`,`{banks.filter(b=>acceptsBank(b,editSubject,editClass)).map(b=><option key={b.id} value={b.id}>{b.title}{b.delivery_mode==='instant_form'?' (Google Form)':''}</option>)}`,'dropdown edit jadwal']
]);
console.log('Selesai. Jalankan: npm run build');
