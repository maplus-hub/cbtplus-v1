// Idempotent patch; always backs up existing App.tsx first; no source file replacement.
import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve('src/App.tsx');
if(!fs.existsSync(file))throw Error('src/App.tsx tidak ditemukan. Jalankan dari root cbtplus-v1.');
let content=fs.readFileSync(file,'utf8');
if(content.includes("import ScoringManager from './ScoringManager';")){
 console.log('Integrasi ScoringManager sudah terpasang, tidak mengubah App.tsx.');process.exit(0);
}
const required=[
 ["import ScheduleManager from './ScheduleManager';","import ScoringManager from './ScoringManager';\nimport ScheduleManager from './ScheduleManager';"],
 ["|'jadwal'|'pengaturan'","|'jadwal'|'penilaian'|'pengaturan'"],
 ["['jadwal','Jadwal Ujian',CalendarDays]","['penilaian','Penilaian & Nilai',ClipboardCheck],['jadwal','Jadwal Ujian',CalendarDays]"],
 ["{tab==='jadwal'&&<ScheduleManager", "{tab==='penilaian'&&<ScoringManager period={activePeriod} subjects={subjects} classes={classes} banks={banks} isAdmin={isAdmin} userId={profile?.id||''} onNotice={flash}/>}\n  {tab==='jadwal'&&<ScheduleManager"]
];
if(!content.includes("from 'lucide-react'"))throw Error('Import lucide-react tidak dikenali.');
for(const [before] of required){if(!content.includes(before))throw Error('Penanda tidak ditemukan: '+before+'. File tidak diubah.');}
// Safely add icon to EXISTING named lucide import.
content=content.replace(/import\s*\{([^}]+)\}\s*from\s*'lucide-react';/, (full,icons)=>{
 if(icons.split(',').map(s=>s.trim()).includes('ClipboardCheck'))return full;
 return full.replace('{'+icons+'}','{'+icons+',ClipboardCheck}');
});
for(const [before,after] of required)content=content.replace(before,after);
const backup=file+'.before-v17.bak';
fs.copyFileSync(file,backup);
fs.writeFileSync(file,content,'utf8');
console.log('Berhasil mengintegrasikan menu Penilaian ke '+file+'; cadangan: '+backup);
