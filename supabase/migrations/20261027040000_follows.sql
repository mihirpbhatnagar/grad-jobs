-- Follow a company: the morning alert flags new roles from companies the user follows.
create table public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  company_key text not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, company_key)
);
alter table public.follows enable row level security;
create policy "own follows are readable" on public.follows for select using (auth.uid() = user_id);
create policy "own follows can be added" on public.follows for insert with check (auth.uid() = user_id);
create policy "own follows can be removed" on public.follows for delete using (auth.uid() = user_id);
