-- Apply tools (company brief, keyword gaps, CV help, cover letter pointers, "sounds like AI"
-- check). Each result is saved so reopening a role never pays twice, with the exact tokens
-- and cost of the request for the at-cost spend split between users. Private to each user.
create table public.ai_outputs (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id bigint references public.roles (id) on delete cascade,
  kind text not null,
  content text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  web_searches int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_outputs_user_role_idx on public.ai_outputs (user_id, role_id, kind, created_at desc);
alter table public.ai_outputs enable row level security;
create policy "own ai outputs are readable" on public.ai_outputs for select using (auth.uid() = user_id);
create policy "own ai outputs can be added" on public.ai_outputs for insert with check (auth.uid() = user_id);
