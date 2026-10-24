-- Main-list rules: roles must start on or after the earliest start date (June 2027),
-- be full-time, and be jobs (internships and apprenticeships are kept for later sections).
alter table public.roles
  add column part_time boolean not null default false,
  add column kind text not null default 'job' check (kind in ('job', 'internship', 'apprenticeship')),
  add column start_status text check (start_status in ('confirmed', 'likely', 'before', 'unknown'));

create index roles_main_list_idx on public.roles (is_open, kind, part_time, start_status, posted_at desc);

insert into public.settings (key, value, note) values
  ('feed.earliest_start', '"2027-06-01"', 'Earliest start date users can take. Roles starting earlier stay out of the main list.')
on conflict (key) do nothing;
