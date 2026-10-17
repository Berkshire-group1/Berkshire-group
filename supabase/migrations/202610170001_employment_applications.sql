-- Employment application storage. Applicant PII is encrypted by the Edge Function.
create extension if not exists pgcrypto;

create table if not exists public.employment_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'in_review', 'interview', 'hired', 'rejected', 'withdrawn')),
  payload_ciphertext text not null,
  front_document_path text not null,
  back_document_path text not null,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed')),
  notification_attempted_at timestamptz,
  notification_error_code text
);

alter table public.employment_applications enable row level security;
revoke all on table public.employment_applications from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employment-id-documents', 'employment-id-documents', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated policies are created for this bucket. Server functions
-- use a server-only service key after performing explicit authorization.
