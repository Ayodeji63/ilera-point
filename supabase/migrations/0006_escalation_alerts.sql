-- Spoken red-flag alerts are stored privately and delivered only through
-- short-lived signed URLs, exactly like consultation video. The existing bucket
-- only accepts video/webm, so alert audio needs its own.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('escalation-alerts', 'escalation-alerts', false, 5242880, array['audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No public storage policy: uploads and signed URLs are issued only by the server.
