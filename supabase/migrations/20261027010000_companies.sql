-- Company facts and logos (free: Wikidata, Wikipedia and employers' own job pages), shown on
-- role cards and role pages. One row per employer name key; misses are kept so they aren't
-- looked up again every day.
create table public.companies (
  key text primary key,
  name text not null,
  wikidata_id text,
  description text,
  summary text,
  wikipedia_url text,
  industry text,
  hq text,
  founded int,
  employees int,
  website text,
  domain text,
  logo_url text,
  checked_at timestamptz not null default now()
);
alter table public.companies enable row level security;
create policy "companies are readable" on public.companies for select using (true);

alter table public.roles
  add column company_key text,
  -- last time the employer's own job page was read for a missing description
  add column details_checked_at timestamptz,
  -- how complete and clearly 2027 the listing is; the default "best match" order
  add column quality int not null default 0;
create index roles_company_key_idx on public.roles (company_key);
create index roles_quality_idx on public.roles (is_open, quality desc, posted_at desc);
