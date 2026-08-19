-- ============================================================
-- SNAPP · Código QR por proyecto (para el correo brandeado del evento)
-- Se guarda en el bucket público 'frames' (misma política de admin).
-- ============================================================
alter table public.projects
  add column if not exists qr_path text;
