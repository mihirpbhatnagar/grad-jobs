-- CV storage: a private bucket where each user can only read and write files inside a
-- folder named after their own user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs', 'cvs', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
)
on conflict (id) do nothing;

create policy "own cv read" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cv upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cv replace" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cv delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.profiles
  add column cv_path text,
  add column cv_name text,
  add column cv_uploaded_at timestamptz;

-- Delete my account (UK GDPR). The app removes the user's CV files through the Storage API
-- first; deleting the auth user then removes their profile, saved roles and history.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
