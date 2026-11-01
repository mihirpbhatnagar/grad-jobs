-- How the user likes to sound (their own notes) and their last self-edited CV rewrite: both go
-- into the AI's instructions so rewrites follow their voice. No model training involved.
alter table public.profiles
  add column style_notes text,
  add column cv_voice_sample text;

-- Per-person daily AI spend cap (US$), on top of the monthly limit in the Anthropic Console.
insert into public.settings (key, value, note) values ('ai.daily_cap_usd', '1', 'Most one person can spend on AI per day, in US$') on conflict (key) do nothing;
