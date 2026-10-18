import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptPayload, isAllowedOrigin, jsonResponse } from "../_shared/security.ts";
const STATUSES = new Set(["new","in_review","interview","hired","rejected","withdrawn"]);

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN") ?? "",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Vary":"Origin"
  }});
  if (request.method !== "POST") return jsonResponse({error:"Method not allowed"},405,origin);
  if (!isAllowedOrigin(origin)) return jsonResponse({error:"Origin not allowed"},403,origin);

  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = (Deno.env.get("ADMIN_EMAIL") ?? "").trim().toLowerCase();
  if (!url || !anon || !service || !adminEmail) return jsonResponse({error:"Admin dashboard is not configured yet"},503,origin);
  const token = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({error:"Sign in required"},401,origin);

  const auth = createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:authError} = await auth.auth.getUser(token);
  if (authError || !userData.user || (userData.user.email ?? "").toLowerCase() !== adminEmail) {
    return jsonResponse({error:"Not authorized"},403,origin);
  }
  let body: {action?:string;id?:string;status?:string;limit?:number};
  try { body = await request.json(); } catch { return jsonResponse({error:"Invalid JSON"},400,origin); }
  const db = createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  if (body.action === "list") {
    const limit = Math.max(1,Math.min(Number(body.limit)||50,100));
    const {data,error} = await db.from("employment_applications")
      .select("id,created_at,status,notification_status").order("created_at",{ascending:false}).limit(limit);
    if (error) return jsonResponse({error:"Could not load applications"},500,origin);
    return jsonResponse({applications:data ?? []},200,origin);
  }
  if (body.action === "detail" && body.id) {
    const {data,error} = await db.from("employment_applications")
      .select("id,created_at,status,payload_ciphertext,front_document_path,back_document_path,notification_status")
      .eq("id",body.id).maybeSingle();
    if (error || !data) return jsonResponse({error:"Application not found"},404,origin);
    let payload: unknown;
    try { payload = await decryptPayload(data.payload_ciphertext); }
    catch { return jsonResponse({error:"Application decryption failed; check encryption-key configuration"},500,origin); }
    const [front,back] = await Promise.all([
      db.storage.from("employment-id-documents").createSignedUrl(data.front_document_path,60),
      db.storage.from("employment-id-documents").createSignedUrl(data.back_document_path,60)
    ]);
    if (front.error || back.error) return jsonResponse({error:"Could not create secure document links"},500,origin);
    return jsonResponse({application:{id:data.id,created_at:data.created_at,status:data.status,
      notification_status:data.notification_status,payload,
      documents:{front_url:front.data.signedUrl,back_url:back.data.signedUrl}}},200,origin);
  }
  if (body.action === "update-status" && body.id && body.status && STATUSES.has(body.status)) {
    const {error} = await db.from("employment_applications").update({status:body.status}).eq("id",body.id);
    if (error) return jsonResponse({error:"Could not update application status"},500,origin);
    return jsonResponse({message:"Status updated"},200,origin);
  }
  return jsonResponse({error:"Unsupported action"},400,origin);
});
