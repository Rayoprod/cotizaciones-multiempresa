-- Deshace 20261031020000_salidas_de_cantera.sql.
-- ATENCIÓN: quita las salidas y los volquetes de las tablas públicas (quedan copiados
-- en el esquema respaldo) y borra su rastro en venta_cambios. La entrega de cada venta
-- se queda como esté. Las cuentas con rol Encargado pierden esa empresa: no pueden
-- pasar a Vendedor, porque verían precios y deudas.

begin;

-- ── Respaldo: lo anotado en la cantera no se puede volver a pedir ───────────

create schema if not exists respaldo;
revoke all on schema respaldo from public, anon, authenticated;

create table respaldo.salidas_20261031 as select * from public.salidas;
create table respaldo.vehiculos_20261031 as select * from public.vehiculos;
create table respaldo.encargados_20261031 as select * from public.usuario_empresa where rol = 'encargado';
revoke all on respaldo.salidas_20261031, respaldo.vehiculos_20261031, respaldo.encargados_20261031
  from public, anon, authenticated;

-- ── Funciones nuevas ───────────────────────────────────────────────────────

drop function public.guardar_vehiculo(text, uuid, text, numeric, text, text, boolean);
drop function public.detener_salidas_venta(uuid, boolean, text);
drop function public.revisar_salida(uuid, text);
drop function public.enlazar_salida(uuid, uuid);
drop function public.anular_salida(uuid, text, timestamptz);
drop function public.registrar_salida(uuid, text, uuid, uuid, text, uuid, text, text, numeric, text, text, text, timestamptz);
drop function public.datos_cantera(text);

-- ── Reglas de ventas: como estaban ─────────────────────────────────────────

create or replace function public.ajustar_venta(
  p_venta_id        uuid,
  p_items           jsonb,
  p_incluye_igv     boolean,
  p_precios_con_igv boolean,
  p_descuento       numeric,
  p_lugar_entrega   text,
  p_observaciones   text,
  p_condicion_pago  text,
  p_dias_credito    integer,
  p_motivo          text,
  p_fecha           date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta    public.ventas%rowtype;
  v_motivo   text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_lugar    text := nullif(btrim(coalesce(p_lugar_entrega, '')), '');
  v_obs      text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_condicion text := coalesce(p_condicion_pago, 'CONTADO');
  v_fecha    date;
  v_incluye  boolean := coalesce(p_incluye_igv, true);
  v_con_igv  boolean := coalesce(p_precios_con_igv, false);
  v_lugares  text[];
  v_items    jsonb;
  v_totales  record;
  v_antes    jsonb;
  v_nombre   text;
  v_item     jsonb;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para ajustar ventas.' using errcode = '42501';
  end if;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or not public.es_admin_de_empresa(v_venta.empresa_id) then
    raise exception 'Solo un admin de la empresa puede ajustar ventas.' using errcode = '42501';
  end if;
  if v_venta.estado <> 'ACTIVA' then
    raise exception 'La venta % está anulada.', v_venta.folio;
  end if;
  if v_motivo is null then
    raise exception 'Indica por qué se ajusta la venta.' using errcode = '22023';
  end if;
  if v_condicion not in ('CONTADO', 'CREDITO') then
    raise exception 'Condición de pago inválida.' using errcode = '22023';
  end if;
  if v_condicion = 'CREDITO' and p_dias_credito is not null and p_dias_credito not between 1 and 365 then
    raise exception 'Los días de crédito deben estar entre 1 y 365.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, v_venta.fecha);
  if v_fecha > (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha de la venta no puede ser futura.' using errcode = '22023';
  end if;

  select lugares_entrega into v_lugares from public.empresas where id = v_venta.empresa_id;
  if v_lugar is not null and v_lugar is distinct from v_venta.lugar_entrega
     and not (v_lugar = any (coalesce(v_lugares, '{}'))) then
    raise exception 'El lugar de entrega "%" no es una de las opciones de la empresa.', v_lugar using errcode = '22023';
  end if;

  v_items := public.normalizar_items_documento(p_items, v_venta.empresa_id);
  select * into v_totales from public.totales_documento(v_items, p_descuento, v_incluye, v_con_igv);
  if v_totales.total < v_venta.pagado then
    raise exception 'La venta ya tiene pagos por S/ % y el total no puede ser menor.', v_venta.pagado using errcode = '22023';
  end if;

  v_antes := public.venta_json(p_venta_id) - 'pagos' - 'venta_cambios';

  delete from public.venta_items
   where venta_id = p_venta_id
     and id not in (select (i->>'id')::uuid from jsonb_array_elements(v_items) i where i->>'id' is not null);

  for v_item in select value from jsonb_array_elements(v_items) loop
    if v_item->>'id' is not null and exists (select 1 from public.venta_items where id = (v_item->>'id')::uuid and venta_id = p_venta_id) then
      update public.venta_items set
        producto_id = (v_item->>'producto_id')::uuid, sku = v_item->>'sku', descripcion = v_item->>'descripcion',
        unidad = v_item->>'unidad', cantidad = (v_item->>'cantidad')::numeric,
        precio_unitario = (v_item->>'precio_unitario')::numeric, importe = (v_item->>'importe')::numeric,
        orden = (v_item->>'orden')::int
      where id = (v_item->>'id')::uuid;
    else
      insert into public.venta_items (venta_id, empresa_id, producto_id, sku, descripcion, unidad, cantidad, precio_unitario, importe, orden)
      values (p_venta_id, v_venta.empresa_id, (v_item->>'producto_id')::uuid, v_item->>'sku', v_item->>'descripcion', v_item->>'unidad',
              (v_item->>'cantidad')::numeric, (v_item->>'precio_unitario')::numeric, (v_item->>'importe')::numeric, (v_item->>'orden')::int);
    end if;
  end loop;

  update public.ventas set
    fecha = v_fecha,
    subtotal = v_totales.subtotal, descuento_global = v_totales.descuento, igv = v_totales.igv, total = v_totales.total,
    incluye_igv = v_incluye, precios_con_igv = v_con_igv,
    lugar_entrega = v_lugar, observaciones = v_obs,
    condicion_pago = v_condicion,
    dias_credito = case when v_condicion = 'CREDITO' then p_dias_credito end,
    vence_el = case when v_condicion = 'CREDITO' and p_dias_credito is not null then v_fecha + p_dias_credito end
  where id = p_venta_id;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();
  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle, motivo)
  values (p_venta_id, v_venta.empresa_id, auth.uid(), v_nombre, 'AJUSTE',
          jsonb_build_object('antes', v_antes, 'despues', public.venta_json(p_venta_id) - 'pagos' - 'venta_cambios'), v_motivo);

  return public.venta_json(p_venta_id);
end;
$$;

create or replace function public.anular_venta(p_venta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta  public.ventas%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nombre text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para anular ventas.' using errcode = '42501';
  end if;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or not public.es_admin_de_empresa(v_venta.empresa_id) then
    raise exception 'Solo un admin de la empresa puede anular ventas.' using errcode = '42501';
  end if;
  if v_venta.estado <> 'ACTIVA' then
    raise exception 'La venta % ya está anulada.', v_venta.folio;
  end if;
  if v_motivo is null then
    raise exception 'Indica por qué se anula la venta.' using errcode = '22023';
  end if;
  if v_venta.pagado > 0 then
    raise exception 'La venta % tiene pagos por S/ %. Anula primero esos pagos.', v_venta.folio, v_venta.pagado;
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();

  update public.ventas
     set estado = 'ANULADA', anulada_en = now(), anulada_por = auth.uid(), anulada_por_nombre = v_nombre, motivo_anulacion = v_motivo
   where id = p_venta_id;

  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, motivo)
  values (p_venta_id, v_venta.empresa_id, auth.uid(), v_nombre, 'ANULACION', v_motivo);

  -- La cotización de origen vuelve a estar abierta: ya no es una venta.
  if v_venta.cotizacion_id is not null then
    update public.cotizaciones set estado = 'PENDIENTE' where id = v_venta.cotizacion_id and estado = 'APROBADA';
  end if;

  return public.venta_json(p_venta_id);
end;
$$;

create or replace function public.marcar_entrega_venta(p_venta_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta  public.ventas%rowtype;
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
  if coalesce(p_estado, '') not in ('PENDIENTE', 'PARCIAL', 'ENTREGADA') then
    raise exception 'Estado de entrega inválido.' using errcode = '22023';
  end if;

  if p_estado <> v_venta.estado_entrega then
    update public.ventas set estado_entrega = p_estado where id = p_venta_id;
    select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();
    insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle)
    values (p_venta_id, v_venta.empresa_id, auth.uid(), v_nombre, 'ENTREGA',
            jsonb_build_object('antes', v_venta.estado_entrega, 'despues', p_estado));
  end if;

  return public.venta_json(p_venta_id);
end;
$$;

-- ── Tablas y columnas ──────────────────────────────────────────────────────

drop function public.recalcular_entrega_venta(uuid);
drop function public.nombre_de_usuario_actual();
drop function public.es_unidad_de_volumen(text);
drop function public.es_unidad_de_servicio(text);
drop function public.normalizar_placa(text);

drop table public.salidas;
drop table public.vehiculos;

delete from public.venta_cambios
 where tipo in ('SALIDAS_DETENIDAS', 'SALIDAS_REANUDADAS', 'SALIDA_ANULADA', 'SALIDA_ENLAZADA', 'SALIDA_MOVIDA');
alter table public.venta_cambios drop constraint venta_cambios_tipo_check;
alter table public.venta_cambios add constraint venta_cambios_tipo_check
  check (tipo in ('AJUSTE', 'ANULACION', 'ENTREGA', 'COMPROBANTE', 'PAGO_ANULADO', 'COMPROBANTE_ANULADO'));

alter table public.ventas
  drop column salidas_detenidas_en,
  drop column salidas_detenidas_por,
  drop column salidas_detenidas_por_nombre,
  drop column motivo_detencion;

alter table public.venta_items drop column entregado;

drop trigger trg_proteger_modulos_empresa on public.empresas;
drop function public.proteger_modulos_empresa();

alter table public.empresas
  drop constraint empresas_modulos_check,
  drop constraint empresas_capacidad_volquete_check,
  drop column modulos,
  drop column capacidad_volquete_m3;

-- ── Rol Encargado ──────────────────────────────────────────────────────────

create or replace function public.asignar_empresas_usuario(p_usuario_id uuid, p_asignaciones jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_asignacion jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador general asigna empresas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_usuario_id) then
    raise exception 'El usuario no existe.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_asignaciones) is distinct from 'array' then
    raise exception 'Las asignaciones deben enviarse como lista.' using errcode = '22023';
  end if;

  for v_asignacion in select value from jsonb_array_elements(p_asignaciones) loop
    if coalesce(v_asignacion->>'empresa_id', '') = '' then
      raise exception 'Falta la empresa en una asignación.' using errcode = '22023';
    end if;
    if coalesce(v_asignacion->>'rol', '') not in ('admin', 'vendedor') then
      raise exception 'Rol inválido en la empresa %: usa admin o vendedor.', v_asignacion->>'empresa_id'
        using errcode = '22023';
    end if;
  end loop;

  delete from public.usuario_empresa ue
   where ue.usuario_id = p_usuario_id
     and not exists (
       select 1 from jsonb_array_elements(p_asignaciones) a where a->>'empresa_id' = ue.empresa_id
     );

  insert into public.usuario_empresa (usuario_id, empresa_id, rol, activo)
  select distinct on (e.id) p_usuario_id, e.id, a->>'rol', true
    from jsonb_array_elements(p_asignaciones) a
    join public.empresas e on e.id = a->>'empresa_id'
  on conflict (usuario_id, empresa_id) do update set rol = excluded.rol, activo = true;
end;
$$;

drop policy empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (public.tiene_acceso_empresa(id));

drop function public.tiene_acceso_cantera(text);

delete from public.usuario_empresa where rol = 'encargado';
alter table public.usuario_empresa drop constraint usuario_empresa_rol_check;
alter table public.usuario_empresa add constraint usuario_empresa_rol_check
  check (rol in ('admin', 'vendedor'));

create or replace function public.tiene_acceso_empresa(p_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_superadmin() or exists (
    select 1
    from usuario_empresa ue
    join profiles p on p.id = ue.usuario_id
    where ue.usuario_id = (select auth.uid())
      and ue.empresa_id = p_empresa_id
      and coalesce(ue.activo, true)
      and coalesce(p.activo, true)
  );
$$;

notify pgrst, 'reload schema';

commit;
