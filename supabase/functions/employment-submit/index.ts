import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://lindawyatt061-glitch.github.io";
const headers = {"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Vary":"Origin"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json","Cache-Control":"no-store"}});
const allowed=new Set(["image/jpeg","image/png","application/pdf"]);
function sig(b:Uint8Array,t:string){if(t==="application/pdf")return String.fromCharCode(...b.slice(0,5))==="%PDF-";if(t==="image/png")return [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);return t==="image/jpeg"&&b[0]===255&&b[1]===216&&b[2]===255;}
Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 if(req.method==="OPTIONS")return origin===ORIGIN?new Response(null,{status:204,headers}):new Response(null,{status:403});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 if(origin!==ORIGIN)return reply({error:"Origin not allowed"},403);
 if(Number(req.headers.get("content-length")||0)>11*1024*1024)return reply({error:"Request too large"},413);
 const secret=Deno.env.get("TURNSTILE_SECRET_KEY"),resend=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("RESEND_FROM_EMAIL"),to=Deno.env.get("NOTIFICATION_EMAIL")||"elizzzmorgann@gmail.com",url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!secret||!resend||!from||!url||!service)return reply({error:"Backend setup is incomplete."},503);
 let f:FormData;try{f=await req.formData();}catch{return reply({error:"Invalid form data"},400);}
 if(String(f.get("website")||"").trim())return reply({ok:true});
 const token=String(f.get("cf-turnstile-response")||"");
 const vr=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({secret,response:token})});
 if(!token||!vr.ok||!(await vr.json()).success)return reply({error:"Security verification failed. Please retry."},400);
 const val=(k:string,n=2000)=>String(f.get(k)||"").trim().slice(0,n),first=val("first_name",100),last=val("last_name",100);
 if(!first||!last)return reply({error:"First and last name are required."},400);
 const front=f.get("driver_license_id_front"),back=f.get("driver_license_id_back");
 if(!(front instanceof File)||!(back instanceof File)||!front.size||!back.size)return reply({error:"Upload both sides of your ID."},400);
 for(const file of [front,back]){if(file.size>5242880||!allowed.has(file.type)||!sig(new Uint8Array(await file.slice(0,16).arrayBuffer()),file.type))return reply({error:"ID files must be valid JPG, PNG, or PDF files no larger than 5 MB."},400);}
 const data:Record<string,unknown>={};
 for(const [k,v] of f.entries()){if(["social_security_number","id_type","id_number","id_issuing_location","id_expiration","driver_license_id_front","driver_license_id_back","cf-turnstile-response","website"].includes(k)||v instanceof File)continue;if(typeof v==="string")data[k]=v.trim().slice(0,2000);}
 const date=val("application_date",10);if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return reply({error:"Invalid application date."},400);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:app,error}=await db.from("employment_applications").insert({first_name:first,last_name:last,telephone:val("telephone",80),position_applied_for:val("position_applied_for",200),application_section:val("application_section",200),application_date:date||null,application_data:data}).select("id,created_at").single();
 if(error||!app){console.error("DB insert failed",error?.code);return reply({error:"Could not save application. Please try again later."},500);}
 const ext=(x:File)=>x.type==="application/pdf"?"pdf":x.type==="image/png"?"png":"jpg",p1=app.id+"/front."+ext(front),p2=app.id+"/back."+ext(back);let up1=false,up2=false;
 try{
  const a=await db.storage.from("employment-documents").upload(p1,front,{contentType:front.type,upsert:false});if(a.error)throw a.error;up1=true;
  const b=await db.storage.from("employment-documents").upload(p2,back,{contentType:back.type,upsert:false});if(b.error)throw b.error;up2=true;
  const s=await db.from("employment_sensitive").insert({application_id:app.id,id_type:val("id_type",100)||null,id_number:val("id_number",150)||null,id_issuing_location:val("id_issuing_location",200)||null,id_expiration:val("id_expiration",10)||null});if(s.error)throw s.error;
  const u=await db.from("employment_applications").update({id_front_path:p1,id_back_path:p2}).eq("id",app.id);if(u.error)throw u.error;
 }catch(e){if(up1)await db.storage.from("employment-documents").remove([p1]);if(up2)await db.storage.from("employment-documents").remove([p2]);await db.from("employment_applications").delete().eq("id",app.id);console.error("Secure save failed",e instanceof Error?e.name:"unknown");return reply({error:"Could not securely save the application. Please retry."},500);}
 let notified=false;try{const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject:"New Berkshire Group employment application",text:"A new application was received.\nApplicant: "+first+" "+last+"\nPosition: "+(val("position_applied_for",200)||"Not specified")+"\nReference: "+app.id+"\nSubmitted: "+app.created_at+"\nSign in to the private admin dashboard to review."})});notified=mail.ok;if(!mail.ok)console.error("Resend failure",mail.status);}catch{console.error("Resend request failed");}
 return reply({ok:true,applicationId:app.id,notificationSent:notified});
});
