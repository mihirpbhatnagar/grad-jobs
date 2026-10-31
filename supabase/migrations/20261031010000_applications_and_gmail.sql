-- Application tracker: each saved role becomes an "application" with its own id, so users can
-- also add applications for roles that aren't in the app (manual: company + title, no role_id).
-- Each application keeps the CV and cover letter actually sent, dates, and a list of updates.
alter table public.application_events drop constraint if exists application_events_user_id_role_id_fkey;
alter table public.saved_roles drop constraint saved_roles_pkey;
alter table public.saved_roles add column id bigint generated always as identity;
alter table public.saved_roles add primary key (id);
alter table public.saved_roles alter column role_id drop not null;
alter table public.saved_roles add constraint saved_roles_user_role_key unique (user_id, role_id);
alter table public.saved_roles
  add column company text,
  add column title text,
  add column url text,
  add column closes_on date,
  add column cv_path text,
  add column cv_name text,
  add column cover_path text,
  add column cover_name text,
  add constraint saved_roles_manual_details check (role_id is not null or (company is not null and title is not null));

-- Updates: stage changes plus notes the user adds ("Online test invite, due 12 Nov").
alter table public.application_events add column application_id bigint references public.saved_roles (id) on delete cascade;
update public.application_events e set application_id = s.id
  from public.saved_roles s where s.user_id = e.user_id and s.role_id = e.role_id;
delete from public.application_events where application_id is null;
alter table public.application_events alter column application_id set not null;
alter table public.application_events alter column role_id drop not null;
alter table public.application_events alter column stage drop not null;
alter table public.application_events add column note text;
create index application_events_application_idx on public.application_events (application_id, happened_at);

-- Cover letters go in the same private bucket (own folder only), so allow plain text too.
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain']
  where id = 'cvs';

-- Gmail link (read-only, opt-in). The refresh token is encrypted by the app with a key only
-- the server has, so even the stored value is useless on its own.
create table public.gmail_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  refresh_token text not null,
  linked_at timestamptz not null default now(),
  last_synced_at timestamptz
);
alter table public.gmail_links enable row level security;
create policy "own gmail link" on public.gmail_links for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- When the "Link your Gmail?" question was answered, so it's only asked once.
alter table public.profiles add column gmail_asked_at timestamptz;
