-- Employer watch list: each employer's own hiring system (Greenhouse, Lever, Ashby,
-- SmartRecruiters, Workable, Workday) or careers-site sitemap, read directly by the daily job.
-- Found free: from apply links on roles we already have, and by checking standard addresses
-- for a seed list of big UK graduate employers. Only the daily job (secret key) reads it.
create table public.employer_feeds (
  id bigserial primary key,
  company_key text not null,
  name text not null,
  ats text not null,          -- greenhouse | lever | ashby | smartrecruiters | workable | workday | sitemap | none
  ats_id text not null,       -- board name, or for Workday "host/tenant/site", or a sitemap URL
  priority int not null default 2,  -- 1 = checked daily (big graduate employers), 2 = weekly
  added_by text not null default 'seed',  -- seed | apply_link | probe
  last_checked timestamptz,
  last_status text,
  last_found int,
  created_at timestamptz not null default now(),
  unique (ats, ats_id)
);
create index employer_feeds_company_idx on public.employer_feeds (company_key);
alter table public.employer_feeds enable row level security;

-- Daily coverage score: how many board-found roles the employer feeds also found, and the
-- share found only by Google Jobs. Readable so the admin page can show it.
create table public.coverage_daily (
  day date primary key,
  stats jsonb not null
);
alter table public.coverage_daily enable row level security;
create policy "coverage is readable" on public.coverage_daily for select using (true);
