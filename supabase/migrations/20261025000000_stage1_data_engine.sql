-- Stage 1: data engine tables.
-- roles: one row per real job, however many sources found it.
-- role_sources: which source (Reed, Google Jobs, ...) found each job, for the coverage score.
-- sponsors: Home Office register of licensed sponsors, refreshed daily.
-- settings: editable thresholds (visa salary rules etc.), never hard-coded.
-- ingest_runs: a log of each daily run.
-- api_usage: hard caps for metered APIs (e.g. Adzuna's 25 free calls).

create extension if not exists pg_trgm;

create table public.roles (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  title text not null,
  employer text not null,
  location text,
  locations text[] not null default '{}',
  salary_min numeric,
  salary_max numeric,
  salary_text text,
  contract_type text,
  full_time boolean,
  description text,
  apply_url text,
  posted_at date,
  expires_at date,
  tags jsonb not null default '{}'::jsonb,
  sponsor_status text check (sponsor_status in ('likely', 'unclear', 'not_listed')),
  sponsor_name text,
  sources text[] not null default '{}',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  is_open boolean not null default true,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(employer, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'C')
  ) stored
);

create index roles_search_idx on public.roles using gin (search);
create index roles_open_posted_idx on public.roles (is_open, posted_at desc);
create index roles_employer_trgm_idx on public.roles using gin (employer gin_trgm_ops);

create table public.role_sources (
  source text not null,
  source_id text not null,
  role_id bigint not null references public.roles (id) on delete cascade,
  url text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (source, source_id)
);

create index role_sources_role_idx on public.role_sources (role_id);

create table public.sponsors (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text not null,
  town text,
  county text,
  ratings text[] not null default '{}',
  routes text[] not null default '{}'
);

create index sponsors_name_key_idx on public.sponsors (name_key);

create table public.settings (
  key text primary key,
  value jsonb not null,
  note text,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value, note) values
  ('visa.standard_salary_gbp', '41700', 'Skilled Worker general threshold (GOV.UK). Check before relying on it.'),
  ('visa.new_entrant_salary_gbp', '33400', 'New entrant minimum (under 26, or switching from Student/Graduate visa).'),
  ('visa.new_entrant_going_rate_pct', '70', 'New entrants must also earn at least this % of the occupation going rate.'),
  ('visa.new_entrant_max_years', '4', 'New-entrant rates capped at this many years total stay, including Graduate visa time.'),
  ('visa.graduate_route_months', '18', 'Graduate route length for applications from 1 Jan 2027.'),
  ('visa.assumed_approval_date', '"2027-07-01"', 'Assumed Graduate visa approval date for every user.');

create table public.ingest_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text
);

create table public.api_usage (
  provider text primary key,
  calls_used integer not null default 0,
  call_cap integer not null,
  note text
);

insert into public.api_usage (provider, call_cap, note) values
  ('adzuna', 25, 'Free test calls only. Paid plan is GBP 8/month; only subscribe if the overlap test shows a real gap.');

-- Row-level security: on for every table. Job listings are public data, so anyone may read
-- roles and role_sources; everything else is only reachable with the server-side secret key.
-- Stage 2 tightens roles to signed-in users once logins exist.
alter table public.roles enable row level security;
alter table public.role_sources enable row level security;
alter table public.sponsors enable row level security;
alter table public.settings enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.api_usage enable row level security;

create policy "roles are readable" on public.roles for select using (true);
create policy "role sources are readable" on public.role_sources for select using (true);
