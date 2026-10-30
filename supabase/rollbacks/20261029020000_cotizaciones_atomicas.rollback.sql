-- Deshace 20261029020000_cotizaciones_atomicas.sql.
-- Antes, deshacer 20261029030000 si se aplicó (devuelve INSERT a authenticated).
-- Se pierden las columnas nuevas: incluye_igv, condiciones, el vínculo de
-- revisiones (cotizacion_origen_id, tipo_origen, folio_origen) y creado_por.

begin;

drop trigger if exists trg_proteger_cotizacion_revisada on public.cotizaciones;
drop function if exists public.proteger_cotizacion_revisada();
drop function if exists public.crear_cotizacion(text, jsonb, jsonb, boolean, text, text, jsonb, uuid, text, boolean);

drop index if exists public.uq_cotizaciones_una_revision;
drop index if exists public.idx_cotizaciones_origen;

alter table public.cotizaciones
  drop constraint if exists fk_cotizaciones_origen,
  drop constraint if exists fk_cotizaciones_creado_por,
  drop constraint if exists cotizaciones_tipo_origen_check,
  drop constraint if exists cotizaciones_origen_con_tipo_check;

alter table public.cotizaciones
  drop column if exists incluye_igv,
  drop column if exists condiciones,
  drop column if exists cotizacion_origen_id,
  drop column if exists tipo_origen,
  drop column if exists folio_origen,
  drop column if exists creado_por;

commit;
