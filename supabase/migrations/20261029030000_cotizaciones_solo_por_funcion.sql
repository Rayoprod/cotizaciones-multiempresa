-- Cierra la escritura directa de cotizaciones y folios.
--
-- Aplicar DESPUÉS de desplegar el frontend que usa crear_cotizacion(): el
-- código anterior inserta directamente y dejaría de poder guardar.
--
-- Después de esto, desde la app solo se puede:
--   * crear cotizaciones con crear_cotizacion() (folio y totales del servidor);
--   * cambiar `estado` y `oculta` de una cotización existente.
-- Nadie puede editar ítems, totales o folios de una cotización emitida, ni
-- borrarla (para eso está "ocultar"), ni tocar el contador de folios.
--
-- También borra funciones que ya nadie usa:
--   * getnextfolioempresa / get_next_folio_empresa: reemplazadas por
--     crear_cotizacion(); dejarlas permitiría quemar folios.
--   * sync_horometro_actual / sync_ultimo_mantenimiento: ningún trigger las
--     usa; el horómetro lo mantiene fn_sync_horometro_maquinaria.
--
-- Reversible con supabase/rollbacks/20261029030000_cotizaciones_solo_por_funcion.rollback.sql

begin;

-- Cotizaciones que el frontend anterior insertó entre 20261029020000 y el
-- despliegue: llegaron sin incluye_igv (tomaron el valor por defecto) ni autor.
-- crear_cotizacion() siempre guarda condiciones, así que se reconocen por eso.
update public.cotizaciones
   set incluye_igv = (igv > 0)
 where condiciones = '{}'::jsonb and incluye_igv is distinct from (igv > 0);

update public.cotizaciones c
   set creado_por = p.id
  from public.profiles p
 where c.creado_por is null and lower(c.vendedor) = lower(p.email);

revoke insert, update, delete on public.cotizaciones from authenticated;
grant update (estado, oculta) on public.cotizaciones to authenticated;

revoke insert, update, delete on public.folios_empresas from authenticated;

drop function public.get_next_folio_empresa(text);
drop function public.getnextfolioempresa(text);
drop function public.sync_horometro_actual();
drop function public.sync_ultimo_mantenimiento();

commit;
