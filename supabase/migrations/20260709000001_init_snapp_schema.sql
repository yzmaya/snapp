-- ============================================================
-- SNAPP · esquema inicial
-- ============================================================

create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  name           text,
  email          text,
  phone          text,
  original_path  text,
  generated_path text,
  generated_url  text,
  status         text not null default 'generated',
  email_sent     boolean not null default false,
  email_sent_at  timestamptz,
  error_message  text
);

create index if not exists submissions_created_at_idx on public.submissions (created_at desc);

alter table public.submissions enable row level security;

-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('originals', 'originals', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('generated', 'generated', true,  10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
