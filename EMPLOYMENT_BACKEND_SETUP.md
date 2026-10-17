# Employment application backend setup

This branch contains a backend scaffold only; it is not live or production-ready. The branch version of `employment.html` has a configurable submission handler, but the Supabase endpoint, public key, and Turnstile site key are placeholders. No Supabase project has been created or deployed yet. The published GitHub Pages URL is `https://elizzzmorgann-beep.github.io/Berkshire-group/`; its browser origin is `https://elizzzmorgann-beep.github.io`.

## Included
- `supabase/migrations/202610170001_employment_applications.sql`: RLS-enabled applications table and private ID-document bucket.
- `supabase/functions/submit-employment/index.ts`: multipart validation, Turnstile verification, AES-GCM encryption of form fields, private ID uploads, and minimal Resend email.
- `supabase/functions/admin-employment/index.ts`: admin-only list/detail/status endpoints and 60-second signed document URLs.
- `supabase/functions/_shared/security.ts`: CORS, encryption, and Turnstile verification.
- `admin.html`: dashboard scaffold. Project URL and public anon/publishable key are placeholders.
- `supabase/.env.example`: names only; no secrets.
- `.gitignore`: ignores local env files.

## Configuration blockers
1. Create a Supabase project and obtain its project URL, project ref, and public anon/publishable key.
2. Create exactly one administrator account in Supabase Auth; set `ADMIN_EMAIL` to that account's email. Keep public sign-up disabled.
3. Create a Cloudflare Turnstile widget for `https://elizzzmorgann-beep.github.io`; put its secret in `TURNSTILE_SECRET_KEY` and later add its public site key to the form.
4. Verify a sender domain/address in Resend and set `EMAIL_FROM` to an allowed sender. `NOTIFICATION_EMAIL` is already set conceptually to `elizzzmorgann@gmail.com`.
5. Generate a random 32-byte key locally, base64-encode it, and set it as `PII_ENCRYPTION_KEY`. Keep a secure backup; losing this key makes saved encrypted application details unrecoverable.
6. Set Edge Function secrets: `ALLOWED_ORIGIN=https://elizzzmorgann-beep.github.io`, `NOTIFICATION_EMAIL=elizzzmorgann@gmail.com`, `ADMIN_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, and `PII_ENCRYPTION_KEY`.
7. Use `ALLOWED_ORIGIN=https://elizzzmorgann-beep.github.io` in Supabase Edge Function Secrets. GitHub Pages project paths (such as `/Berkshire-group/`) are not part of the browser origin. The existing visitor relay is unrelated to application submission.
8. Configure the project URL and public anon/publishable key in `admin.html`. These two values are public; never put a service-role key in browser code.

Generate the encryption key locally, e.g. `openssl rand -base64 32`. Copy it directly to Supabase Edge Function Secrets; do not paste it in chat, a PR, or a committed file.

Supabase's hosted Edge Function runtime provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in standard deployments. Never expose the service-role key.

## Deployment sequence
1. Install Supabase CLI and log in locally.
2. Link the checkout to the project using its project ref.
3. Review and apply the migration with `supabase db push`.
4. Set the Edge Function secrets above.
5. Deploy `submit-employment` and `admin-employment`.
6. Configure the dashboard's public project URL/key and create the single admin account. Disable public sign-up.
7. Wire `employment.html` to POST `FormData` to `/functions/v1/submit-employment`; add the Turnstile widget/site key and a honeypot input. Only show success after a successful response.
8. Test with synthetic data only: anonymous reads denied, unauthenticated admin requests denied, wrong admin email denied, invalid files rejected, signed links expire, and saved applications remain available if email delivery fails.

## Sensitive data
All form fields (including SSN/ID numbers) are encrypted with AES-GCM before database insertion. ID files are held in a private bucket; the dashboard function creates short-lived signed links only after checking the signed-in Supabase Auth email against `ADMIN_EMAIL`. Emails contain only a submission reference, never applicant details or ID files.

Encryption is not a substitute for a retention/deletion policy or legal/privacy review. Confirm SSN and government ID collection is necessary before launch. Current endpoint checks file signatures for common formats and caps files at 5 MB each; add rate limiting, monitoring, and a reliable email retry mechanism before relying on this operationally.

## Not production-ready yet
- The backend branch modifies `employment.html` to call the configured submission endpoint, but this branch has not been merged into `main` or tested live. The current published `main` version still contains sensitive SSN/ID fields with a placeholder form action; do not collect or submit real applicant identity information until the secure backend is deployed and verified.
- Project, migration, and functions have not been deployed or tested against a real Supabase instance.
- Resend sender/API key, Turnstile widget/secret, admin Auth account, encryption key, and dashboard client values remain unconfigured.
- No automated retry queue or dedicated rate-limit layer is included.
Do not merge or collect real applicant data until all blockers are resolved and security checks pass.
