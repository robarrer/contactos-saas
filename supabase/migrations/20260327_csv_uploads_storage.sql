-- Bucket temporal para staging de uploads CSV grandes.
-- El browser sube aquí directamente (bypassa Vercel) y el API route lo lee con service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'csv-uploads',
  'csv-uploads',
  false,
  52428800, -- 50 MB
  array['application/json']
)
on conflict (id) do nothing;

-- Usuarios autenticados pueden subir a su propia carpeta (agentId/timestamp.json)
create policy "csv_uploads_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'csv-uploads');

-- Solo service role puede leer/eliminar (el API route usa service role; bypasa RLS)
