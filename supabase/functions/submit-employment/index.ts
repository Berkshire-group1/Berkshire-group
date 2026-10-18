import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptPayload, isAllowedOrigin, jsonResponse, verifyTurnstile } from "../_shared/security.ts";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const REQUIRED_FIELDS = ["first_name", "last_name", "telephone", "position_applied_for"];

function sniffFile(bytes: Uint8Array, mime: string): boolean {
  if (mime === "application/pdf") return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (mime === "image/png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  return false;
}
function extensionFor(mime: string): string {
  return ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "application/pdf":"pdf" } as Record<string,string>)[mime];
}
function cleanText(value: FormDataEntryValue | null, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0,max) : "";
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status:204, headers:{
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Vary":"Origin"
  }});
  if (request.method !== "POST") return jsonResponse({error:"Method not allowed"},405,origin);
  if (!isAllowedOrigin(origin)) return jsonResponse({error:"Origin not allowed"},403,origin);
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 11 * 1024 * 1024) return jsonResponse({error:"Submission too large"},413,origin);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceKey ||
      !Deno.env.get("PII_ENCRYPTION_KEY") || !Deno.env.get("TURNSTILE_SECRET_KEY")) {
    return jsonResponse({error:"Application submission is not configured yet"},503,origin);
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return jsonResponse({error:"Expected multipart form data"},400,origin); }

  if (cleanText(form.get("website"),300)) return jsonResponse({message:"Application received"},201,origin);
  if (!await verifyTurnstile(cleanText(form.get("cf-turnstile-response"),4096), request.headers.get("CF-Connecting-IP"))) {
    return jsonResponse({error:"Please complete the verification challenge and try again"},400,origin);
  }

  const payload: Record<string,string|string[]> = {};
  for (const [key,value] of form.entries()) {
    if (["driver_license_id_front","driver_license_id_back","cf-turnstile-response","website"].includes(key) || typeof value !== "string") continue;
    const safeKey = key.replace(/[^a-zA-Z0-9_]/g,"").slice(0,80);
    if (!safeKey) continue;
    if (safeKey === "employment_desired") {
      const old = Array.isArray(payload[safeKey]) ? payload[safeKey] as string[] : [];
      old.push(value.slice(0,100)); payload[safeKey] = old;
    } else payload[safeKey] = value.trim().slice(0,2000);
  }
  for (const key of REQUIRED_FIELDS) if (!String(payload[key] ?? "").trim()) {
    return jsonResponse({error:"Please complete all required fields"},400,origin);
  }

  const front = form.get("driver_license_id_front");
  const back = form.get("driver_license_id_back");
  if (!(front instanceof File) || !(back instanceof File) || !front.size || !back.size) {
    return jsonResponse({error:"Both ID document sides are required"},400,origin);
  }
  const validFiles: Array<{side:string; bytes:Uint8Array; mime:string; ext:string}> = [];
  for (const item of [{side:"front",file:front},{side:"back",file:back}]) {
    if (item.file.size > MAX_FILE_BYTES) return jsonResponse({error:"Each ID file must be 5 MB or smaller"},413,origin);
    const mime = item.file.type.toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) return jsonResponse({error:"ID files must be PDF, JPEG, PNG, or WebP"},400,origin);
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    if (!sniffFile(bytes,mime)) return jsonResponse({error:"An uploaded file does not match its declared type"},400,origin);
    validFiles.push({side:item.side,bytes,mime,ext:extensionFor(mime)});
  }

  const supabase = createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const id = crypto.randomUUID();
  const uploaded: string[] = [];
  try {
    for (const file of validFiles) {
      const path = id + "/" + file.side + "." + file.ext;
      const {error} = await supabase.storage.from("employment-id-documents").upload(path,file.bytes,{
        contentType:file.mime,upsert:false,cacheControl:"0"
      });
      if (error) throw new Error("document_upload_failed");
      uploaded.push(path);
    }
    const {error} = await supabase.from("employment_applications").insert({
      id, payload_ciphertext:await encryptPayload(payload), front_document_path:uploaded[0],
      back_document_path:uploaded[1], status:"new", notification_status:"disabled"
    });
    if (error) throw new Error("application_save_failed");
  } catch {
    if (uploaded.length) await supabase.storage.from("employment-id-documents").remove(uploaded).catch(()=>undefined);
    return jsonResponse({error:"We could not safely save your application. Please try again later."},500,origin);
  }

  // Email notifications are intentionally disabled; admins review submissions in the secure dashboard.
  return jsonResponse({message:"Application received",application_id:id,notification_status:"disabled"},201,origin);
});
