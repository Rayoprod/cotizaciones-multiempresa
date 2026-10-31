-- Deshace 20261031000000_facturas_por_venta.sql.
-- ATENCIÓN: borra las facturas y boletas anotadas desde entonces, y su rastro en
-- venta_cambios. Antes de usarlo, respalda venta_comprobantes.
--
-- Storage no permite borrar buckets ni archivos por SQL. Sin las políticas nadie
-- puede ver ni subir archivos; el bucket se borra a mano en el panel:
-- Supabase → Storage → comprobantes → Delete bucket.

begin;

drop policy if exists comprobantes_subir on storage.objects;
drop policy if exists comprobantes_ver on storage.objects;

create or replace function public.venta_json(p_venta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(v) || jsonb_build_object(
    'venta_items', coalesce((select jsonb_agg(to_jsonb(i) order by i.orden) from public.venta_items i where i.venta_id = v.id), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(to_jsonb(p) order by p.fecha, p.registrado_en) from public.pagos p where p.venta_id = v.id), '[]'::jsonb),
    'venta_cambios', coalesce((select jsonb_agg(to_jsonb(c) order by c.fecha desc) from public.venta_cambios c where c.venta_id = v.id), '[]'::jsonb)
  )
  from public.ventas v
  where v.id = p_venta_id;
$$;

drop function public.anular_comprobante_venta(uuid, text);
drop function public.adjuntar_archivo_comprobante(uuid, text, text);
drop function public.agregar_comprobante_venta(uuid, text, text, numeric, date);

delete from public.venta_cambios where tipo = 'COMPROBANTE_ANULADO';
alter table public.venta_cambios drop constraint venta_cambios_tipo_check;
alter table public.venta_cambios add constraint venta_cambios_tipo_check
  check (tipo in ('AJUSTE', 'ANULACION', 'ENTREGA', 'COMPROBANTE', 'PAGO_ANULADO'));

drop table public.venta_comprobantes;

notify pgrst, 'reload schema';

commit;
