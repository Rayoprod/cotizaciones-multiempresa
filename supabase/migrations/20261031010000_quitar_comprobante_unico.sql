-- Quita el número único de factura por venta, reemplazado por venta_comprobantes.
--
-- Se aplica DESPUÉS de desplegar el frontend que usa venta_comprobantes: la versión
-- anterior llama a guardar_comprobante_venta(). Copia antes lo que se haya anotado
-- con ella desde 20261031000000.
--
-- Reversible con supabase/rollbacks/20261031010000_quitar_comprobante_unico.rollback.sql

begin;

insert into public.venta_comprobantes (venta_id, empresa_id, tipo, numero, fecha, monto, creado_por, creado_por_nombre)
select v.id, v.empresa_id, coalesce(v.comprobante_tipo, 'FACTURA'), v.comprobante_numero, v.fecha, v.total, v.creado_por, v.vendedor_nombre
  from public.ventas v
 where v.comprobante_numero is not null and v.total > 0
   and not exists (select 1 from public.venta_comprobantes c
                    where c.venta_id = v.id and c.numero = v.comprobante_numero and not c.anulado);

drop function public.guardar_comprobante_venta(uuid, text, text);

alter table public.ventas
  drop column comprobante_tipo,
  drop column comprobante_numero;

notify pgrst, 'reload schema';

commit;
