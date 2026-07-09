-- Proveedor de imagen que generó cada foto (google:aistudio | google:vertex | openai)
alter table public.submissions
  add column if not exists provider text;
