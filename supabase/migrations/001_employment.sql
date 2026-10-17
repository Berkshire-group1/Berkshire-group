create extension if not exists pgcrypto;
create table if not exists public.employment_applications (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 status text not null default 'new' check (status in ('new','in_review','interview','hired','rejected')),
 application_date date,
 first_name text not null,
 last_name text not null,
 telephone text,
 position_applied_for text,
 application_section text,
 application_data jsonb not null default '{}'::jsonb,
 id_front_path text,
 id_back_path text
);
create table if not exists public.employment_sensitive (
 application_id uuid primary key references public.employment_applications(id) on delete cascade,
 id_type text,
 id_number text,
 id_issuing_location text,
 id_expiration date
);
create table if not exists public.employment_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('employment-documents','employment-documents',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','application/pdf'];
alter table public.employment_applications enable row level security;
alter table public.employment_sensitive enable row level security;
alter table public.employment_admins enable row level security;
revoke all on public.employment_applications from anon,authenticated;
revoke all on public.employment_sensitive from anon,authenticated;
revoke all on public.employment_admins from anon,authenticated;
grant select on public.employment_applications to authenticated;
grant select on public.employment_sensitive to authenticated;
grant select on public.employment_admins to authenticated;
create policy "admins read own membership" on public.employment_admins for select to authenticated using(user_id=(select auth.uid()));
create policy "admins read applications" on public.employment_applications for select to authenticated using(exists(select 1 from public.employment_admins a where a.user_id=(select auth.uid())));
create policy "admins read sensitive application details" on public.employment_sensitive for select to authenticated using(exists(select 1 from public.employment_admins a where a.user_id=(select auth.uid())));
create policy "admins read private employment documents" on storage.objects for select to authenticated using(bucket_id='employment-documents' and exists(select 1 from public.employment_admins a where a.user_id=(select auth.uid())));
create or replace function public.set_employment_application_status(application_id uuid,new_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.employment_admins a where a.user_id=auth.uid()) then raise exception 'Not authorized'; end if;
 if new_status not in ('new','in_review','interview','hired','rejected') then raise exception 'Invalid status'; end if;
 update public.employment_applications set status=new_status where id=application_id;
 if not found then raise exception 'Application not found'; end if;
end; $$;
revoke all on function public.set_employment_application_status(uuid,text) from public,anon;
grant execute on function public.set_employment_application_status(uuid,text) to authenticated;
