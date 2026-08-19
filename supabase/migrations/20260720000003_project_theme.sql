-- ============================================================
-- SNAPP · Tema/identidad por proyecto (solo afecta el kiosko público)
-- 'default' = look SNAPP azul · 'sss' = Summer Supplier Summit (claro rojo/azul)
-- ============================================================
alter table public.projects
  add column if not exists theme text not null default 'default';

-- La vista pública ahora expone el tema para que el kiosko aplique el look.
create or replace view public.v_active_project as
  select id, title, theme from public.projects where is_active limit 1;
grant select on public.v_active_project to anon, authenticated;
