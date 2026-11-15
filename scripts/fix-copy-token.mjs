import fs from 'node:fs';
import path from 'node:path';

const target=path.resolve('src/TokenCenterAdmin.tsx');
if(!fs.existsSync(target)){
  console.error('File src/TokenCenterAdmin.tsx tidak ditemukan. Jalankan dari root proyek CBTPlus.');
  process.exit(1);
}
let code=fs.readFileSync(target,'utf8');
const old='onClick={()=>void navigator.clipboard.writeText(token)}';
const newer='onClick={()=>void handleCopyToken()}';
const marker='export default function TokenCenterAdmin(){';
const helper=`// Clipboard fallback untuk browser yang menolak Clipboard API (mis. akses lewat HTTP LAN).\nasync function copyTokenSafely(value:string):Promise<boolean>{\n  if(window.isSecureContext && navigator.clipboard?.writeText){\n    try { await navigator.clipboard.writeText(value); return true; } catch { /* gunakan fallback */ }\n  }\n  const textarea=document.createElement('textarea');\n  textarea.value=value;\n  textarea.setAttribute('readonly','');\n  textarea.style.position='fixed';\n  textarea.style.top='0';\n  textarea.style.left='-9999px';\n  document.body.appendChild(textarea);\n  textarea.focus();\n  textarea.select();\n  let copied=false;\n  try { copied=document.execCommand('copy'); } catch { copied=false; }\n  textarea.remove();\n  return copied;\n}\n\n`;
const action=`  async function handleCopyToken(){\n    if(!token)return;\n    const copied=await copyTokenSafely(token);\n    if(copied){\n      setMessage('Token berhasil disalin ke clipboard.');\n    }else{\n      setMessage('Browser membatasi akses clipboard. Salin token secara manual pada dialog yang muncul.');\n      window.prompt('Salin token dengan Ctrl+C, lalu Enter:',token);\n    }\n  }\n`;
if(code.includes(newer) && code.includes('copyTokenSafely')){
  console.log('Hotfix salin token sudah terpasang, tidak ada perubahan.');
  process.exit(0);
}
if(!code.includes(old) || !code.includes(marker)){
  console.error('Struktur TokenCenterAdmin.tsx berbeda dengan versi yang diperiksa; patch dibatalkan tanpa mengubah file.');
  process.exit(2);
}
const backup=target+'.before-copy-hotfix.bak';
if(!fs.existsSync(backup))fs.copyFileSync(target,backup);
code=code.replace(marker,helper+marker);
code=code.replace('  return <div>\n    <div className="pageintro"',action+'  return <div>\n    <div className="pageintro"');
if(!code.includes('async function handleCopyToken()')){
  console.error('Titik penyisipan fungsi tidak ditemukan. Patch dibatalkan.');
  process.exit(3);
}
code=code.replace(old,newer);
fs.writeFileSync(target,code,'utf8');
console.log('Berhasil memperbaiki tombol Salin Token. Backup: '+backup);
