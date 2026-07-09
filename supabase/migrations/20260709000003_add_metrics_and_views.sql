-- ============================================================
-- SNAPP · métricas de producto + base de contactos para el cliente
-- ============================================================
alter table public.submissions
  add column if not exists captured_at     timestamptz,
  add column if not exists generation_ms   integer,
  add column if not exists email_ms        integer,
  add column if not exists model           text,
  add column if not exists fallback_used   boolean not null default false,
  add column if not exists provider_trail  jsonb,
  add column if not exists original_bytes  integer,
  add column if not exists generated_bytes integer,
  add column if not exists user_agent      text,
  add column if not exists event_name      text not null default 'demo';

create index if not exists submissions_event_idx on public.submissions (event_name);
create index if not exists submissions_captured_idx on public.submissions (captured_at desc);

-- Vista 1 · Base de contactos (leads) para el cliente
create or replace view public.v_contacts as
select
  id, created_at,
  event_name    as evento,
  name          as nombre,
  email         as correo,
  phone         as telefono,
  email_sent    as correo_enviado,
  generated_url as foto_lego
from public.submissions
where email is not null
order by created_at desc;

-- Vista 2 · Métricas por evento (resumen ejecutivo)
create or replace view public.v_event_metrics as
select
  event_name                                        as evento,
  count(*)                                          as total_fotos,
  count(*) filter (where email is not null)         as contactos_capturados,
  count(*) filter (where email_sent)                as correos_enviados,
  count(*) filter (where phone is not null and phone <> '') as con_telefono,
  count(*) filter (where status = 'error')          as errores,
  round(avg(generation_ms))                         as gen_ms_promedio,
  min(generation_ms)                                as gen_ms_min,
  max(generation_ms)                                as gen_ms_max,
  round(avg(email_ms))                              as email_ms_promedio,
  count(*) filter (where fallback_used)             as veces_uso_respaldo,
  round(avg(generated_bytes) / 1024.0)              as kb_promedio_generada,
  min(created_at)                                   as primera_foto,
  max(created_at)                                   as ultima_foto
from public.submissions
group by event_name;

-- Vista 3 · Actividad por hora (horas pico)
create or replace view public.v_hourly_activity as
select
  event_name                        as evento,
  date_trunc('hour', created_at)    as hora,
  count(*)                          as fotos,
  count(*) filter (where email_sent) as correos
from public.submissions
group by event_name, date_trunc('hour', created_at)
order by hora desc;

-- Vista 4 · Uso por proveedor y modelo (salud técnica)
create or replace view public.v_provider_stats as
select
  coalesce(provider, 'desconocido')  as proveedor,
  coalesce(model, 'n/a')             as modelo,
  count(*)                           as fotos,
  round(avg(generation_ms))          as gen_ms_promedio,
  count(*) filter (where fallback_used) as veces_respaldo,
  count(*) filter (where status = 'error') as errores
from public.submissions
group by provider, model
order by fotos desc;
