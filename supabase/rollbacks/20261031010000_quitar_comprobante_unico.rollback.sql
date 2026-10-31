-- Deshace 20261031010000_quitar_comprobante_unico.sql.
-- Cada venta recupera un solo número: el de su primera factura o boleta vigente.
-- Las demás siguen en venta_comprobantes.

begin;

alter table public.ventas
  add column comprobante_tipo text check (comprobante_tipo in ('FACTURA', 'BOLETA')),
  add column comprobante_numero text;

update public.ventas v
   set comprobante_tipo = c.tipo, comprobante_numero = c.numero
  from (select distinct on (venta_id) venta_id, tipo, numero
          from public.venta_comprobantes
         where not anulado
         order by venta_id, fecha, registrado_en) c
 where c.venta_id = v.id;

create function public.guardar_comprobante_venta(p_venta_id uuid, p_tipo text, p_numero text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta  public.ventas%rowtype;
  v_numero text := upper(nullif(btrim(coalesce(p_numero, '')), ''));
  v_tipo   text := case when v_numero is null then null else p_tipo end;
  v_nombre text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para actualizar ventas.' using errcode = '42501';
  end if;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or not public.tiene_acceso_empresa(v_venta.empresa_id) then
    raise exception 'La venta no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_venta.estado <> 'ACTIVA' then
    raise exception 'La venta % está anulada.', v_venta.folio;
  end if;
  if v_numero is not null and coalesce(v_tipo, '') not in ('FACTURA', 'BOLETA') then
    raise exception 'Indica si es factura o boleta.' using errcode = '22023';
  end if;
  if length(coalesce(v_numero, '')) > 30 then
    raise exception 'El número del comprobante es demasiado largo.' using errcode = '22023';
  end if;

  update public.ventas set comprobante_tipo = v_tipo, comprobante_numero = v_numero where id = p_venta_id;
  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();
  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle)
  values (p_venta_id, v_venta.empresa_id, auth.uid(), v_nombre, 'COMPROBANTE',
          jsonb_build_object('antes', jsonb_build_object('tipo', v_venta.comprobante_tipo, 'numero', v_venta.comprobante_numero),
                             'despues', jsonb_build_object('tipo', v_tipo, 'numero', v_numero)));

  return public.venta_json(p_venta_id);
end;
$$;

revoke all on function public.guardar_comprobante_venta(uuid, text, text) from public, anon;
grant execute on function public.guardar_comprobante_venta(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
