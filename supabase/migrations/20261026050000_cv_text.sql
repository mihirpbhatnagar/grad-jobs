-- Text read from the user's CV (free text extraction, no AI) and the role types it suggests.
-- The text is also what the Stage 3 CV tools will work from. Private to the user via RLS.
alter table public.profiles
  add column cv_text text,
  add column cv_suggested_fields text[] not null default '{}';
