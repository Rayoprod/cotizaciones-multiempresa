-- Deshace 20261029040000_escrituras_atomicas_y_logos.sql.
--
-- Storage no permite borrar buckets por SQL. Sin las políticas, el bucket
-- `empresas` queda inofensivo (nadie puede subir); para eliminarlo: panel de
-- Supabase → Storage → empresas → Delete bucket. Si ya hay empresas cuyo
-- logo apunta a ese bucket, cámbialas antes.

begin;

drop policy if exists empresas_subir_imagenes on storage.objects;
drop policy if exists empresas_ver_imagenes on storage.objects;
drop policy if exists empresas_borrar_imagenes on storage.objects;

drop function if exists public.asignar_empresas_usuario(uuid, text[]);
drop function if exists public.guardar_cuentas_bancarias(text, jsonb);

commit;
