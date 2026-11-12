// CBTPlus — secure server-side teacher invitation.
// Deploy with verify_jwt enabled (default); do not expose SUPABASE_SERVICE_ROLE_KEY to frontend.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const respond=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return respond(405,{error:'Method not allowed'});
 const url=Deno.env.get('SUPABASE_URL');const publicKey=Deno.env.get('SUPABASE_ANON_KEY');const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!publicKey||!serviceKey)return respond(500,{error:'Konfigurasi server belum lengkap'});
 const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
 if(!jwt)return respond(401,{error:'Harus login'});
 const caller=createClient(url,publicKey,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false}});
 const {data:userData,error:userError}=await caller.auth.getUser(jwt);
 if(userError||!userData.user)return respond(401,{error:'Sesi tidak valid'});
 const {data:callerProfile,error:profileError}=await caller.from('profiles').select('role').eq('id',userData.user.id).single();
 if(profileError||callerProfile?.role!=='admin')return respond(403,{error:'Hanya administrator'});
 let body:unknown;
 try{body=await req.json()}catch{return respond(400,{error:'JSON tidak valid'})}
 const form=(body&&typeof body==='object'?body:{}) as Record<string,unknown>;
 const email=String(form.email??'').trim().toLowerCase();const full_name=String(form.full_name??'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||full_name.length<3||full_name.length>150)return respond(400,{error:'Nama atau email tidak valid'});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:invite,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name}});
 if(inviteError)return respond(400,{error:inviteError.message});
 const id=invite.user?.id;
 if(!id)return respond(500,{error:'Auth tidak mengembalikan UID'});
 const {error:insertError}=await admin.from('profiles').upsert({id,full_name,role:'guru'},{onConflict:'id'});
 if(insertError){
   // Roll back newly invited account rather than leaving an unassigned account.
   const {error:rollbackError}=await admin.auth.admin.deleteUser(id);
   return respond(500,{error:'Gagal membuat profil guru: '+insertError.message+(rollbackError?' (rollback akun perlu diperiksa)':'')});
 }
 return respond(200,{ok:true,id});
});
