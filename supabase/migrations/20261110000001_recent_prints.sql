-- Últimas fotos generadas, para reimprimir desde /#/print.
-- Solo para cuentas @mayam.lat; devuelve lo mínimo (sin correo ni teléfono).
create or replace function public.recent_prints(p_limit int default 5)
returns table (
  id uuid,
  created_at timestamptz,
  name text,
  project_title text,
  generated_url text
)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') not like '%@mayam.lat' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select s.id, s.created_at, s.name, s.project_title, s.generated_url
    from public.submissions s
    where s.generated_url is not null
    order by s.created_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 50);
end; $$;

revoke all on function public.recent_prints(int) from public, anon;
grant execute on function public.recent_prints(int) to authenticated;
