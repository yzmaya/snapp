-- ============================================================
-- SNAPP · Estilos por proyecto (1–3 opciones con imagen de ejemplo)
-- Cada estilo tiene su propio prompt y una imagen de ejemplo del
-- resultado. En el kiosko el invitado elige un estilo antes de la
-- foto y ese prompt es el que usa la generación.
-- ============================================================
create table if not exists public.project_variants (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  position     int  not null default 0,
  label        text not null default 'Opción',
  prompt       text not null default '',
  example_path text,
  created_at   timestamptz not null default now()
);
create index if not exists project_variants_project
  on public.project_variants (project_id);

alter table public.project_variants enable row level security;

drop policy if exists project_variants_admin_all on public.project_variants;
create policy project_variants_admin_all on public.project_variants
  for all to authenticated
  using ((auth.jwt() ->> 'email') like '%@mayam.lat')
  with check ((auth.jwt() ->> 'email') like '%@mayam.lat');

-- Vista pública: estilos del proyecto activo (NO expone el prompt).
-- El kiosko solo necesita id, etiqueta e imagen de ejemplo; el prompt
-- lo lee la edge function del lado del servidor.
create or replace view public.v_active_variants as
  select v.id, v.project_id, v.position, v.label, v.example_path
  from public.project_variants v
  join public.projects p on p.id = v.project_id
  where p.is_active
  order by v.position, v.created_at;
grant select on public.v_active_variants to anon, authenticated;

-- Bucket de imágenes de ejemplo (públicas, escritura solo admin).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('examples', 'examples', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public;

drop policy if exists examples_admin_write on storage.objects;
create policy examples_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'examples' and (auth.jwt() ->> 'email') like '%@mayam.lat')
  with check (bucket_id = 'examples' and (auth.jwt() ->> 'email') like '%@mayam.lat');

-- Estilo elegido en cada generación (para métricas).
alter table public.submissions
  add column if not exists variant_id    uuid,
  add column if not exists variant_label text;
