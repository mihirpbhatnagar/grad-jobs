-- Settings hold visa thresholds and similar non-secret values; the app reads them to show
-- each role's visa fit, so they're readable by everyone (still only editable with the secret key).
create policy "settings are readable" on public.settings for select using (true);
