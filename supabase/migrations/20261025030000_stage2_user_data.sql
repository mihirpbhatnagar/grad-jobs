-- Stage 2: private per-user data. Row-level security means each signed-in user can only
-- read and change their own rows; nobody else (including other users) can see them.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Profile answers, each with its "Use in For you" switch:
  -- { fields: {value: string[], forYou: bool}, goals: {...}, locations: {...}, salary: {...}, sponsors: {...}, dontShow: {...} }
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- One row per role a user has saved; `stage` moves it through the application pipeline.
create table public.saved_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id bigint not null references public.roles (id) on delete cascade,
  stage text not null default 'saved'
    check (stage in ('saved', 'applying', 'applied', 'test', 'interview', 'assessment_centre', 'offer', 'rejected')),
  notes text,
  saved_at timestamptz not null default now(),
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index saved_roles_user_stage_idx on public.saved_roles (user_id, stage);

-- History of stage changes, for the dashboard (response rates, dates).
create table public.application_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  role_id bigint not null,
  stage text not null,
  happened_at timestamptz not null default now(),
  foreign key (user_id, role_id) references public.saved_roles (user_id, role_id) on delete cascade
);

alter table public.profiles enable row level security;
alter table public.saved_roles enable row level security;
alter table public.application_events enable row level security;

create policy "own profile" on public.profiles for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own saved roles" on public.saved_roles for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own application events" on public.application_events for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
