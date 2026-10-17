export const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
export function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}
export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function encryptionKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("PII_ENCRYPTION_KEY");
  if (!raw) throw new Error("PII_ENCRYPTION_KEY is not configured");
  const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  if (bytes.byteLength !== 32) throw new Error("PII_ENCRYPTION_KEY must be base64-encoded 32 random bytes");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function encryptPayload(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), plaintext);
  return "v1." + base64Url(iv) + "." + base64Url(new Uint8Array(encrypted));
}
export async function decryptPayload(value: string): Promise<unknown> {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("Unsupported encrypted payload format");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(ivText) },
    await encryptionKey(), fromBase64Url(cipherText));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
export function isAllowedOrigin(origin: string | null): boolean {
  return Boolean(ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN);
}
export async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    if (!response.ok) return false;
    return (await response.json()).success === true;
  } catch { return false; }
}
