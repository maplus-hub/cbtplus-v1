// CBTPlus v1.8.1 -- centralized privileged API. Never expose SERVICE_ROLE to clients.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publishKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const encryptionKey = Deno.env.get('CBT_TOKEN_ENCRYPTION_KEY')!;
const adminDb = createClient(url, serviceKey, { auth: { persistSession: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const reply = (value: unknown, status=200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(size: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, n => chars[n % chars.length]).join('');
}
function required(value: unknown, label: string) {
  if(typeof value !== 'string' || !value.trim()) throw Error(`${label} wajib diisi`);
  return value.trim();
}
function checkDb<T>(r:{data:T|null,error:{message:string}|null}):T {
  if(r.error) throw Error(r.error.message);
  return r.data as T;
}
async function key() {
  if(!encryptionKey) throw Error('CBT_TOKEN_ENCRYPTION_KEY belum diatur di Edge Function secrets');
  const bytes=Uint8Array.from(atob(encryptionKey), x=>x.charCodeAt(0));
  if(bytes.length!==32) throw Error('CBT_TOKEN_ENCRYPTION_KEY harus base64 dari 32 byte acak');
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes));}
async function seal(plain:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(plain)));
  return b64(iv)+'.'+b64(ciphertext);
}
async function unseal(enc:string) {
  const [iv64,c64]=enc.split('.');
  const iv=Uint8Array.from(atob(iv64),c=>c.charCodeAt(0));
  const c=Uint8Array.from(atob(c64),c=>c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(),c));
}
async function adminOnly(req:Request) {
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!jwt) throw Error('Login admin diperlukan');
  const authClient=createClient(url,publishKey,{auth:{persistSession:false}});
  const {data:{user},error}=await authClient.auth.getUser(jwt);
  if(error||!user) throw Error('Sesi admin tidak valid');
  const profile=checkDb(await adminDb.from('profiles').select('role').eq('id',user.id).single());
  if(profile.role!=='admin') throw Error('Hanya admin yang diizinkan');
  return user.id;
}
async function validateSupervisor(session:string) {
  return checkDb(await adminDb.rpc('cbt_v181_verify_supervisor',{p_session:session})) as {period_id:string;room_id:string;label:string;expires_at:string};
}
async function supervisorOverview(session:string, examDate:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(examDate)||Number.isNaN(Date.parse(examDate)))throw Error('Tanggal ujian tidak valid');
  const dayStart=new Date(`${examDate}T00:00:00+07:00`);
  const dayEnd=new Date(dayStart.getTime()+86400000);
  const scope=await validateSupervisor(session);
  const assigned=checkDb(await adminDb.from('room_assignments').select('student_id').eq('period_id',scope.period_id).eq('room_id',scope.room_id));
  const ids=assigned.map((a:{student_id:string})=>a.student_id);
  const pupils=ids.length?checkDb(await adminDb.from('students').select('id,nis,full_name,class_id,status').in('id',ids)):[];
  const classIds=[...new Set(pupils.filter((s:{status:string})=>s.status==='Aktif').map((s:{class_id:string})=>s.class_id))];
  const scheduleRows=classIds.length?checkDb(await adminDb.from('exam_schedules')
     .select('id,subject_id,class_id,starts_at,ends_at,status')
     .eq('period_id',scope.period_id).eq('status','published').in('class_id',classIds)
     .gte('starts_at',dayStart.toISOString()).lt('starts_at',dayEnd.toISOString())
     .order('starts_at')):[];
  // The supervisor sees published sessions for his/her actual assigned room only.
  const scheduleIds=scheduleRows.map((s:{id:string})=>s.id);
  const vault=scheduleIds.length?checkDb(await adminDb.from('cbt_lesson_token_vault')
    .select('schedule_id,ciphertext').in('schedule_id',scheduleIds)):[];
  const vaultMap=new Map(vault.map((v:{schedule_id:string;ciphertext:string})=>[v.schedule_id,v.ciphertext]));
  const subjects=scheduleRows.length?checkDb(await adminDb.from('subjects').select('id,name').in('id',[...new Set(scheduleRows.map((s:{subject_id:string})=>s.subject_id))])):[];
  const classes=classIds.length?checkDb(await adminDb.from('classes').select('id,code').in('id',classIds)):[];
  const attempts=scheduleIds.length && ids.length ?checkDb(await adminDb.from('exam_attempts')
    .select('id,student_id,schedule_id,status').in('schedule_id',scheduleIds).in('student_id',ids)):[];
  const override=checkDb(await adminDb.from('cbt_room_override_tokens').select('ciphertext,rotated_at')
    .eq('period_id',scope.period_id).eq('room_id',scope.room_id).maybeSingle());
  const rooms=checkDb(await adminDb.from('exam_rooms').select('name').eq('id',scope.room_id).single());
  const periods=checkDb(await adminDb.from('exam_periods').select('title,academic_year').eq('id',scope.period_id).single());
  return {
    ...scope,room_name:rooms.name,period_title:`${periods.title} ${periods.academic_year}`,
    schedules:await Promise.all(scheduleRows.map(async(s:{id:string;class_id:string;subject_id:string})=>({
      ...s,class_name:classes.find((c:{id:string})=>c.id===s.class_id)?.code,
      subject_name:subjects.find((x:{id:string})=>x.id===s.subject_id)?.name,
      token:vaultMap.has(s.id)?await unseal(vaultMap.get(s.id)!):null,
      student_count:pupils.filter((x:{class_id:string})=>x.class_id===s.class_id).length,
    }))),pupils,attempts,
    override_token:override?.ciphertext?await unseal(override.ciphertext):null,
    override_rotated_at:override?.rotated_at||null,
  };
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  try {
    const input=await req.json();const op=required(input.op,'Operasi');
    if(op==='admin_options') {
      await adminOnly(req);
      const periods=checkDb(await adminDb.from('exam_periods').select('id,title,academic_year,is_active').order('start_date',{ascending:false}));
      const rooms=checkDb(await adminDb.from('exam_rooms').select('id,name,location').order('sort_order'));
      const schedules=checkDb(await adminDb.from('exam_schedules').select('id,period_id,class_id,subject_id,status,starts_at,ends_at').order('starts_at',{ascending:false}).limit(2000));
      const subjects=checkDb(await adminDb.from('subjects').select('id,name'));
      const classes=checkDb(await adminDb.from('classes').select('id,code'));
      return reply({periods,rooms,schedules,subjects,classes});
    }
    if(op==='admin_issue_supervisor') {
      await adminOnly(req);
      const period=required(input.period_id,'Periode'),room=required(input.room_id,'Ruang');
      const tag=randomCode(8);const token=`${tag}-${randomCode(24)}`;
      checkDb(await adminDb.rpc('cbt_v181_issue_supervisor',{p_period:period,p_room:room,p_tag:tag,p_token:token,p_label:input.label||''}));
      return reply({token,room_id:room,period_id:period,message:'Token sebelumnya tidak berlaku'});
    }
    if(op==='admin_issue_lesson') {
      await adminOnly(req);
      const schedule=required(input.schedule_id,'Jadwal');
      const token=randomCode(8);
      checkDb(await adminDb.rpc('cbt_v181_issue_lesson',{p_schedule:schedule,p_token:token,p_cipher:await seal(token)}));
      return reply({token,schedule_id:schedule});
    }
    if(op==='supervisor_login') {
      const token=required(input.token,'Token pengawas').toUpperCase();
      return reply(checkDb(await adminDb.rpc('cbt_v181_login_supervisor',{p_token:token})));
    }
    if(op==='supervisor_overview') return reply(await supervisorOverview(required(input.session,'Sesi pengawas'),required(input.exam_date,'Tanggal ujian')));
    if(op==='supervisor_rotate') {
      const session=required(input.session,'Sesi pengawas');await validateSupervisor(session);
      const token=randomCode(16);
      checkDb(await adminDb.rpc('cbt_v181_rotate_override',{p_session:session,p_token:token,p_cipher:await seal(token)}));
      return reply({token,message:'Token lama telah dinonaktifkan'});
    }
    if(op==='supervisor_lock') {
      const session=required(input.session,'Sesi pengawas');
      checkDb(await adminDb.rpc('cbt_v181_supervisor_lock',{p_session:session,p_attempt:required(input.attempt_id,'Pengerjaan')}));
      return reply({ok:true});
    }
    if(op==='student_override') {
      // Intentionally disabled until a device-bound, NIS-based student session is
      // verified server-side. NIS + shared lesson token alone cannot prove identity.
      return reply({error:'Aksi siswa akan diaktifkan bersama autentikasi APK/EXE berbasis sesi perangkat'},403);
    }
    return reply({error:'Operasi tidak dikenal'},400);
  } catch(e){
    // Avoid echoing credentials or raw payloads.
    console.error('token-center:',e instanceof Error?e.message:String(e));
    return reply({error:e instanceof Error?e.message:'Permintaan gagal'},400);
  }
});
