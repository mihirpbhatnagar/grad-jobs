-- Inbox sync: updates that came from an employer email remember the Gmail message id, so the
-- same email is never processed twice. Only the subject, date and stage are kept.
alter table public.application_events add column email_id text;
create unique index application_events_email_idx on public.application_events (user_id, email_id) where email_id is not null;

-- "No reply" flag on applications, editable like the visa thresholds.
insert into public.settings (key, value, note) values ('inbox.no_reply_weeks', '4', 'Flag an application as "no reply" after this many weeks with no update') on conflict (key) do nothing;
