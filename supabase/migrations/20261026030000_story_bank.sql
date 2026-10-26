-- Story bank: the user's raw notes on real experiences, used later by the CV tools so they
-- only ever draw on things the user has actually done.
alter table public.profiles
  add column story_bank text,
  add column story_bank_updated_at timestamptz;
