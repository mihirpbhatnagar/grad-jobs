-- Listings a source returned that failed the early-career check (e.g. senior roles Reed
-- flags as "graduate"), remembered so the daily job doesn't re-download them.
create table public.excluded_listings (
  source text not null,
  source_id text not null,
  reason text,
  last_seen timestamptz not null default now(),
  primary key (source, source_id)
);

alter table public.excluded_listings enable row level security;

insert into public.settings (key, value, note) values
  ('google_jobs.depth', '50', 'Results per Google Jobs search (billed per 10). Raise to 100 after the $50 top-up.'),
  ('google_jobs.max_cost_usd_per_run', '0.1', 'Hard cap on DataForSEO spend per daily run, in USD.')
on conflict (key) do nothing;
