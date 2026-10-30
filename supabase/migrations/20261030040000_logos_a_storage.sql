-- Logos y firmas en base64 → URLs del bucket `empresas`.
--
-- BLOQUETERA_VDC (logo y firma) y RAYO (logo) guardaban la imagen como texto
-- base64 dentro de la fila: 2.35 MB que viajaban en cada consulta de
-- empresas y en sessionStorage. Las imágenes se reducen a 800 px (JPEG) y se
-- suben ANTES de aplicar esto, con:
--
--   supabase storage cp <archivo> ss:///empresas/<EMPRESA>/<tipo>-20261030.jpg \
--     --linked --experimental --content-type image/jpeg --cache-control "max-age=31536000"
--
-- Solo cambia las filas que aún tienen base64; los valores anteriores quedan
-- en respaldo.logos_20261030 para el rollback.
--
-- Reversible con supabase/rollbacks/20261030040000_logos_a_storage.rollback.sql

begin;

create table respaldo.logos_20261030 as
  select id, ruta_logo, ruta_firma from public.empresas
   where ruta_logo like 'data:%' or ruta_firma like 'data:%';
revoke all on respaldo.logos_20261030 from public, anon, authenticated;

update public.empresas
   set ruta_logo = 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/empresas/BLOQUETERA_VDC/logo-20261030.jpg'
 where id = 'BLOQUETERA_VDC' and ruta_logo like 'data:%';

update public.empresas
   set ruta_firma = 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/empresas/BLOQUETERA_VDC/firma-20261030.jpg'
 where id = 'BLOQUETERA_VDC' and ruta_firma like 'data:%';

update public.empresas
   set ruta_logo = 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/empresas/RAYO/logo-20261030.jpg'
 where id = 'RAYO' and ruta_logo like 'data:%';

commit;
