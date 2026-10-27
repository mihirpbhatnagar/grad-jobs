-- Alerts: daily email digest and Telegram instant alerts (deadline countdowns, closed-role
-- warnings, rolling-role nudges, new For you matches). Each user links their own Telegram
-- chat with a private code; nothing is sent unless they connect or keep the digest on.
alter table public.profiles
  add column telegram_link_code text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  add column telegram_chat_id bigint,
  add column alerts jsonb not null default '{"emailDigest": true, "telegram": true}'::jsonb,
  add column last_digest_at timestamptz;

-- Which alerts each user has had, so nothing is sent twice.
create table public.alerts_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id bigint not null references public.roles (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, role_id, kind)
);
alter table public.alerts_sent enable row level security;
create policy "own alerts are readable" on public.alerts_sent for select using (auth.uid() = user_id);
