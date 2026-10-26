-- Semantic matching with pgvector and a free open-source embedding model
-- (all-MiniLM-L6-v2, 384 numbers per text). Roles are embedded by the daily job; a user's
-- goals are embedded in their own browser when they save their profile.
create extension if not exists vector;

alter table public.roles add column embedding vector(384);
alter table public.profiles add column goal_embedding vector(384);

-- How close each main-list role is in meaning to the given text embedding (1 = same meaning).
create or replace function public.match_roles(query vector(384), max_results int default 500)
returns table (id bigint, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select r.id, 1 - (r.embedding <=> query) as similarity
  from public.roles r
  where r.is_open and r.kind = 'job' and not r.part_time
    and r.start_status in ('confirmed', 'likely') and r.embedding is not null
  order by r.embedding <=> query
  limit max_results;
$$;

grant execute on function public.match_roles(vector, int) to anon, authenticated;
