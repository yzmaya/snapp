-- ============================================================
-- SNAPP · Proyectos administrables + panel admin
-- ============================================================
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  title           text not null default 'Proyecto',
  prompt          text not null,
  model_key       text not null default 'nano-banana-2', -- nano-banana-2 | nano-banana-pro | vertex
  use_logo        boolean not null default false,
  logo_white_path text,
  logo_color_path text,
  is_active       boolean not null default false
);

create unique index if not exists projects_single_active
  on public.projects (is_active) where is_active;

alter table public.projects enable row level security;

drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects
  for all to authenticated
  using ((auth.jwt() ->> 'email') like '%@mayam.lat')
  with check ((auth.jwt() ->> 'email') like '%@mayam.lat');

create or replace function public.set_active_project(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.projects set is_active = false where is_active;
  update public.projects set is_active = true  where id = p_id;
end; $$;
revoke all on function public.set_active_project(uuid) from public;
grant execute on function public.set_active_project(uuid) to authenticated;

create or replace view public.v_active_project as
  select id, title from public.projects where is_active limit 1;
grant select on public.v_active_project to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 5242880, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = excluded.public;

drop policy if exists logos_admin_write on storage.objects;
create policy logos_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'logos' and (auth.jwt() ->> 'email') like '%@mayam.lat')
  with check (bucket_id = 'logos' and (auth.jwt() ->> 'email') like '%@mayam.lat');

-- Seed: proyecto LEGO como activo
insert into public.projects (title, prompt, model_key, is_active)
select 'LEGO',
  'Toma todas las referencias visuales, estéticas y de vestimenta de esta foto, y conviértelo en un personaje de LEGO. Si hay varias personas, conviértelas a todas en personajes de LEGO, conservando sus rasgos, colores de ropa y peinados de forma reconocible. Estilo minifigura de LEGO, alta calidad.',
  'nano-banana-2', true
where not exists (select 1 from public.projects);

-- Referencia de proyecto en submissions
alter table public.submissions
  add column if not exists project_id    uuid,
  add column if not exists project_title text;
