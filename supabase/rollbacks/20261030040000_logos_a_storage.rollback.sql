-- Deshace 20261030040000_logos_a_storage.sql: vuelve a poner los logos y
-- firmas en base64 desde respaldo.logos_20261030. Los archivos subidos al
-- bucket quedan ahí (se borran desde el panel de Storage si se quiere).

begin;

update public.empresas e
   set ruta_logo = r.ruta_logo,
       ruta_firma = r.ruta_firma
  from respaldo.logos_20261030 r
 where r.id = e.id;

drop table respaldo.logos_20261030;

commit;
