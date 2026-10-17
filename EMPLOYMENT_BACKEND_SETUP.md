# Employment application backend setup

This branch contains the backend implementation, and the Supabase database migration plus both Edge Functions have now been deployed. It is still NOT production-ready: Edge Function secrets, the Turnstile widget/site key, the Resend sender, and the single admin Auth user still need configuration. The project URL and publishable key are filled into the branch's form/dashboard files; do not merge or collect real applications until the remaining checks pass. The published GitHub Pages URL is `https://elizzzmorgann-beep.github.io/Berkshire-group/`; its browser origin is `https://elizzzmorgann-beep.github.io`.

## Included
- `supabase/migrations/202610170001_employment_applications.sql`: RLS-enabled applications table and private ID-document bucket.
- `supabase/functions/submit-employment/index.ts`: multipart validation, Turnstile verification, AES-GCM encryption of form fields, private ID uploads, and minimal Resend email.
- `supabase/functions/admin-employment/index.ts`: admin-only list/detail/status endpoints and 60-second signed document URLs.
- `supabase/functions/_shared/security.ts`: CORS, encryption, and Turnstile verification.
- `admin.html`: dashboard scaffold. Project URL and public anon/publishable key are placeholders.
- `supabase/.env.example`: names only; no secrets.
- `.gitignore`: ignores local env files.

## Configuration blockers
1. Supabase project created: `mkgtsivgmqicxedaewoj` (US East). Project URL: `https://mkgtsivgmqicxedaewoj.supabase.co`. A public publishable key is configured in the branch's frontend files.
2. STILL REQUIRED: create exactly one administrator account in Supabase Auth; set `ADMIN_EMAIL` to that account's email. Keep public sign-up disabled.
3. STILL REQUIRED: create a Cloudflare Turnstile widget for `elizzzmorgann-beep.github.io`; put its secret in `TURNSTILE_SECRET_KEY` and its public site key in `employment.html`.
4. STILL REQUIRED: verify a sender domain/address in Resend and set `EMAIL_FROM` to an allowed sender. `NOTIFICATION_EMAIL` should be `elizzzmorgann@gmail.com`.
5. STILL REQUIRED: generate a random 32-byte key locally, base64-encode it, and set it as `PII_ENCRYPTION_KEY`. Keep a secure backup; losing this key makes saved encrypted application details unrecoverable.
6. STILL REQUIRED: set Edge Function secrets: `ALLOWED_ORIGIN=https://elizzzmorgann-beep.github.io`, `NOTIFICATION_EMAIL=elizzzmorgann@gmail.com`, `ADMIN_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, and `PII_ENCRYPTION_KEY`.
7. Set `ALLOWED_ORIGIN=https://elizzzmorgann-beep.github.io` in Supabase Edge Function Secrets. GitHub Pages project paths (such as `/Berkshire-group/`) are not part of the browser origin. The existing visitor relay is unrelated to application submission.
8. Configure the project URL and public anon/publishable key in `admin.html`. These two values are public; never put a service-role key in browser code.

Generate the encryption key locally, e.g. `openssl rand -base64 32`. Copy it directly to Supabase Edge Function Secrets; do not paste it in chat, a PR, or a committed file.

Supabase's hosted Edge Function runtime provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in standard deployments. Never expose the service-role key.

## Deployment sequence
1. DONE: created the Supabase project.
2. DONE: applied migration `employment_applications`; `public.employment_applications` has RLS enabled and no public/authenticated policies, and the `employment-id-documents` bucket is private.
3. DONE: deployed `submit-employment` (public endpoint with origin, Turnstile and payload validation) and `admin-employment` (gateway JWT verification enabled, plus admin-email authorization).
4. STILL REQUIRED: set the Edge Function secrets above. The available connected controls here do not expose a secrets-write operation, so add these through the Supabase Dashboard > Edge Functions > Secrets.
5. DONE: the branch's `employment.html` and `admin.html` now contain the project URL and public publishable key; these are not privileged secrets.
6. STILL REQUIRED: configure the Turnstile site key and create the one admin Auth account. Disable public sign-up.
7. STILL REQUIRED: configure Resend and test with synthetic data only: anonymous reads denied, unauthenticated admin requests denied, wrong admin email denied, invalid files rejected, signed links expire, and saved applications remain available if email delivery fails.

## Sensitive data
All form fields (including SSN/ID numbers) are encrypted with AES-GCM before database insertion. ID files are held in a private bucket; the dashboard function creates short-lived signed links only after checking the signed-in Supabase Auth email against `ADMIN_EMAIL`. Emails contain only a submission reference, never applicant details or ID files.

Encryption is not a substitute for a retention/deletion policy or legal/privacy review. Confirm SSN and government ID collection is necessary before launch. Current endpoint checks file signatures for common formats and caps files at 5 MB each; add rate limiting, monitoring, and a reliable email retry mechanism before relying on this operationally.

## Not production-ready yet
- The backend branch modifies `employment.html` to call the configured submission endpoint, but this branch has not been merged into `main` or tested live. The current published `main` version still contains sensitive SSN/ID fields with a placeholder form action; do not collect or submit real applicant identity information until the secure backend is deployed and verified.
- The project, migration, and functions are deployed, but a live end-to-end application test has not been completed because required secrets and external providers are not configured.
- Resend sender/API key, Turnstile widget/secret/site key, admin Auth account, and encryption key remain unconfigured. The project URL and public publishable key are filled into the backend branch.
- No automated retry queue or dedicated rate-limit layer is included.
Do not merge or collect real applicant data until all blockers are resolved and security checks pass. Project status and function deployment were verified on 2026-10-17; security advisor currently reports only the expected informational warning that the applications table has RLS enabled with no policies.
