-- ============================================================
-- SNAPP · Marco por proyecto (superposición fija sobre la imagen final)
-- El marco es un PNG con el centro TRANSPARENTE (la ventana donde
-- aparece la foto). Se compone del lado del servidor sobre el
-- resultado IA o sobre la foto original, según el proyecto.
-- ============================================================
alter table public.projects
  add column if not exists use_frame    boolean not null default false,
  add column if not exists frame_path   text,
  -- 'generated' = enmarca el resultado IA · 'original' = enmarca la foto sin IA
  add column if not exists frame_source text not null default 'generated';

-- Bucket de marcos (públicos, escritura solo admin). PNG/WebP con alfa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frames', 'frames', true, 10485760, array['image/png','image/webp'])
on conflict (id) do update set public = excluded.public;

drop policy if exists frames_admin_write on storage.objects;
create policy frames_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'frames' and (auth.jwt() ->> 'email') like '%@mayam.lat')
  with check (bucket_id = 'frames' and (auth.jwt() ->> 'email') like '%@mayam.lat');
