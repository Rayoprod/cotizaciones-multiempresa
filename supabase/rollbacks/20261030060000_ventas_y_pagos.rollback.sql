-- Deshace 20261030060000_ventas_y_pagos.sql.
-- ATENCIÓN: borra todas las ventas, pagos e historial registrados desde entonces.
-- Las cotizaciones convertidas siguen en Aprobada. Antes de usarlo, respalda esas tablas.

begin;

create or replace function public.controlar_cambio_estado_cotizacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision text;
  v_nombre   text;
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  if old.estado = 'ANULADA' then
    select folio into v_revision from public.cotizaciones
     where cotizacion_origen_id = old.id and tipo_origen = 'revision';
    if found then
      raise exception 'La cotización % fue reemplazada por la revisión %; no se puede reactivar.',
        old.folio, v_revision;
    end if;
    raise exception 'La cotización % está anulada y no se puede reactivar. Puedes duplicarla.', old.folio;
  end if;

  if not ((old.estado = 'PENDIENTE' and new.estado in ('APROBADA', 'ANULADA'))
       or (old.estado = 'APROBADA'  and new.estado in ('PENDIENTE', 'ANULADA'))) then
    raise exception 'La cotización % no puede pasar de % a %.', old.folio, old.estado, new.estado;
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre
    from public.profiles where id = auth.uid();
  new.estado_cambiado_en := now();
  new.estado_cambiado_por := auth.uid();
  new.estado_cambiado_por_nombre := v_nombre;
  return new;
end;
$$;

drop function public.guardar_comprobante_venta(uuid, text, text);
drop function public.marcar_entrega_venta(uuid, text);
drop function public.anular_venta(uuid, text);
drop function public.ajustar_venta(uuid, jsonb, boolean, boolean, numeric, text, text, text, integer, text, date);
drop function public.anular_pago(uuid, text);
drop function public.registrar_pago(uuid, numeric, text, date, text, text);
drop function public.convertir_cotizacion_en_venta(uuid, text, integer, date, jsonb, text, text);
drop function public.crear_venta(text, jsonb, jsonb, boolean, boolean, numeric, text, text, jsonb, text, integer, date, jsonb, text, boolean);
drop function public.insertar_venta(text, jsonb, jsonb, boolean, boolean, numeric, text, text, jsonb, text, integer, date, jsonb, text, uuid, text, boolean);
drop function public.venta_json(uuid);
drop function public.insertar_pago(public.ventas, numeric, text, date, text, text);
drop function public.totales_documento(jsonb, numeric, boolean, boolean);
drop function public.normalizar_items_documento(jsonb, text);

drop table public.venta_cambios;
drop table public.pagos;
drop table public.venta_items;
drop table public.ventas;
drop table public.folios_documentos;

notify pgrst, 'reload schema';

commit;
