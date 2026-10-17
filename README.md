# Berkshire Group employment backend

The backend code is prepared in this branch; it is **not live** until the Supabase migration and Edge Function are deployed and the remaining provider keys are configured.

## Project
Project ref: `mkgtsivgmqicxedaewoj`
Project URL: `https://mkgtsivgmqicxedaewoj.supabase.co`
Public website origin: `https://lindawyatt061-glitch.github.io`
Notification recipient: `elizzzmorgann@gmail.com`

## Deploy
1. Review and run `supabase/migrations/001_employment.sql` in Supabase SQL Editor.
2. Create an Auth user for the administrator, then add their UUID: `insert into public.employment_admins(user_id) select id from auth.users where email='elizzzmorgann@gmail.com' on conflict do nothing;`
3. Set Supabase Edge Function secrets: `ALLOWED_ORIGIN`, `NOTIFICATION_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified sender), `TURNSTILE_SECRET_KEY`. Do not commit secret values. The function requires the platform's server-side `SUPABASE_SERVICE_ROLE_KEY`.
4. Create a Cloudflare Turnstile widget for the website and add its site key to `employment.html`; the secret goes only in Supabase secrets.
5. Add the project's publishable key to `employment.html` and `admin.html`.
6. Deploy with Supabase CLI: `supabase login`, `supabase link --project-ref mkgtsivgmqicxedaewoj`, `supabase functions deploy employment-submit --no-verify-jwt`.
7. Test with synthetic data only. Confirm anonymous table reads and storage reads fail, authorized admin reads succeed, and Resend notification arrives.

## Data minimization
The existing SSN input should be removed before deployment. The function explicitly does not persist the SSN field. Government ID numbers and ID uploads are highly sensitive; retain them only if the employer has confirmed the legal and operational need, access policy, and retention/deletion schedule.

Never commit service-role keys, Resend keys, Turnstile secrets, passwords, or real applicant data.
