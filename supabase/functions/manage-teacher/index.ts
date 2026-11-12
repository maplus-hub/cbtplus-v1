import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const respond=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return respond(405,{error:'Method not allowed'});
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!secret)return respond(500,{error:'Konfigurasi Edge Function belum lengkap'});
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return respond(401,{error:'Login diperlukan'});
 const client=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data:auth,error:authError}=await client.auth.getUser(token);if(authError||!auth.user)return respond(401,{error:'Sesi tidak valid'});
 const {data:caller,error:callerError}=await client.from('profiles').select('role').eq('id',auth.user.id).single();
 if(callerError||caller?.role!=='admin')return respond(403,{error:'Hanya administrator'});
 let body:Record<string,unknown>;try{body=await req.json()}catch{return respond(400,{error:'JSON tidak valid'})}
 const id=String(body.teacher_id??''),action=String(body.action??'');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!['update','delete'].includes(action))return respond(400,{error:'Permintaan tidak valid'});
 if(id===auth.user.id)return respond(403,{error:'Tidak boleh mengubah akun sendiri dari menu guru'});
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:teacher,error:teacherError}=await admin.from('profiles').select('id,role').eq('id',id).single();
 if(teacherError||teacher?.role!=='guru')return respond(404,{error:'Akun guru tidak ditemukan'});
 if(action==='update'){
   const name=String(body.full_name??'').trim();if(name.length<3||name.length>150)return respond(400,{error:'Nama harus 3–150 karakter'});
   const {error}=await admin.from('profiles').update({full_name:name}).eq('id',id).eq('role','guru');
   if(error)return respond(400,{error:error.message});
   const {error:metaError}=await admin.auth.admin.updateUserById(id,{user_metadata:{full_name:name}});
   if(metaError)return respond(500,{error:'Profil berubah, metadata Auth gagal: '+metaError.message});
   return respond(200,{ok:true});
 }
 // Auth user deletion may cascade to other records. Forbid deletion when bank ownership exists.
 const {count,error:countError}=await admin.from('question_banks').select('id',{count:'exact',head:true}).eq('owner_id',id);
 if(countError)return respond(500,{error:countError.message});
 if((count??0)>0)return respond(409,{error:'Guru masih memiliki bank soal. Pindahkan kepemilikan bank terlebih dahulu sebelum menghapus akun.'});
 const {error:deleteError}=await admin.auth.admin.deleteUser(id);
 if(deleteError)return respond(400,{error:deleteError.message});
 return respond(200,{ok:true});
});
