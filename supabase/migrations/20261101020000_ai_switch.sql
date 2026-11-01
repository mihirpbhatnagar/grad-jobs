-- Overall AI switch: nothing calls the Anthropic API (Apply tools, inbox sorting) until this is true.
insert into public.settings (key, value, note) values ('ai.enabled', 'false', 'Turn all AI features on or off (Mihir authorises spending)') on conflict (key) do nothing;
