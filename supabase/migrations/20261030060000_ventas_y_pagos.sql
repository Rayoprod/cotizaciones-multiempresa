-- Ventas y pagos.
--
-- Una venta nace directa o desde una cotización (que pasa a Aprobada en la misma
-- transacción). Lleva su propia serie de folios, se paga en una o varias partes y
-- tiene una sola factura o boleta, de la que aquí solo se guarda el número.
--
-- Reglas:
--   * Siempre con RUC o DNI válido.
--   * Puede llevar una fecha anterior a hoy; `registrada_en` guarda cuándo se anotó.
--   * Cualquiera de la empresa registra pagos, marca la entrega y anota la factura.
--   * Solo el admin anula pagos, ajusta o anula la venta. Todo deja rastro.
--   * A diferencia de las cotizaciones, una venta se ajusta sin cambiar de folio:
--     vive semanas y se le suman m³ o se le cambia el precio.
--
-- Solo se escribe por estas funciones; `authenticated` únicamente lee.
-- El frontend actual sigue funcionando hasta desplegar el nuevo.
-- Reversible con supabase/rollbacks/20261030060000_ventas_y_pagos.rollback.sql

begin;

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table public.folios_documentos (
  empresa_id text not null references public.empresas(id) on update cascade on delete cascade,
  tipo       text not null check (tipo in ('VENTA')),
  secuencia  integer not null default 0,
  primary key (empresa_id, tipo)
);

create table public.ventas (
  id                 uuid primary key default gen_random_uuid(),
  folio              text not null,
  fecha              date not null,
  registrada_en      timestamptz not null default now(),
  empresa_id         text not null references public.empresas(id) on update cascade,
  estado             text not null default 'ACTIVA' check (estado in ('ACTIVA', 'ANULADA')),
  estado_entrega     text not null default 'PENDIENTE' check (estado_entrega in ('PENDIENTE', 'PARCIAL', 'ENTREGADA')),

  cliente_id         uuid references public.clientes(id) on delete set null,
  cliente_nombre     text not null,
  cliente_documento  text not null check (cliente_documento ~ '^(\d{8}|\d{11})$'),
  cliente_telefono   text,
  cliente_direccion  text,
  cliente_correo     text,

  subtotal           numeric(10,2) not null,
  descuento_global   numeric(10,2) not null default 0,
  igv                numeric(10,2) not null,
  total              numeric(10,2) not null,
  incluye_igv        boolean not null,
  precios_con_igv    boolean not null default false,

  pagado             numeric(10,2) not null default 0,
  saldo              numeric(10,2) generated always as (total - pagado) stored,
  condicion_pago     text not null default 'CONTADO' check (condicion_pago in ('CONTADO', 'CREDITO')),
  dias_credito       integer check (dias_credito between 1 and 365),
  vence_el           date,

  lugar_entrega      text,
  observaciones      text,
  condiciones        jsonb not null default '{}'::jsonb,
  comprobante_tipo   text check (comprobante_tipo in ('FACTURA', 'BOLETA')),
  comprobante_numero text,

  cotizacion_id      uuid references public.cotizaciones(id) on delete set null,
  folio_cotizacion   text,
  vendedor           text,
  vendedor_nombre    text,
  creado_por         uuid references public.profiles(id) on delete set null,

  anulada_en         timestamptz,
  anulada_por        uuid references public.profiles(id) on delete set null,
  anulada_por_nombre text,
  motivo_anulacion   text,

  unique (empresa_id, folio),
  check (not precios_con_igv or incluye_igv),
  check (descuento_global >= 0 and descuento_global <= subtotal),
  check (pagado >= 0 and pagado <= total),
  check (condicion_pago = 'CREDITO' or (dias_credito is null and vence_el is null))
);

create table public.venta_items (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references public.ventas(id) on delete cascade,
  empresa_id      text not null references public.empresas(id) on update cascade,
  producto_id     uuid references public.productos(id) on delete set null,
  sku             text,
  descripcion     text not null,
  unidad          text not null,
  cantidad        numeric(14,4) not null check (cantidad > 0),
  precio_unitario numeric(14,4) not null check (precio_unitario >= 0),
  importe         numeric(10,2) not null,
  orden           integer not null default 0
);

create table public.pagos (
  id                 uuid primary key default gen_random_uuid(),
  venta_id           uuid not null references public.ventas(id) on delete cascade,
  empresa_id         text not null references public.empresas(id) on update cascade,
  fecha              date not null,
  monto              numeric(10,2) not null check (monto > 0),
  metodo             text not null check (metodo in ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE_PLIN', 'CHEQUE', 'OTRO')),
  referencia         text,
  nota               text,
  registrado_en      timestamptz not null default clock_timestamp(),
  creado_por         uuid references public.profiles(id) on delete set null,
  creado_por_nombre  text,
  anulado            boolean not null default false,
  anulado_en         timestamptz,
  anulado_por        uuid references public.profiles(id) on delete set null,
  anulado_por_nombre text,
  motivo_anulacion   text
);

create table public.venta_cambios (
  id             uuid primary key default gen_random_uuid(),
  venta_id       uuid not null references public.ventas(id) on delete cascade,
  empresa_id     text not null references public.empresas(id) on update cascade,
  fecha          timestamptz not null default clock_timestamp(),
  usuario        uuid references public.profiles(id) on delete set null,
  usuario_nombre text,
  tipo           text not null check (tipo in ('AJUSTE', 'ANULACION', 'ENTREGA', 'COMPROBANTE', 'PAGO_ANULADO')),
  detalle        jsonb not null default '{}'::jsonb,
  motivo         text
);

create index idx_ventas_empresa_fecha on public.ventas (empresa_id, fecha desc);
create unique index uq_ventas_cotizacion_activa on public.ventas (cotizacion_id)
  where cotizacion_id is not null and estado = 'ACTIVA';
create index idx_ventas_cliente on public.ventas (cliente_id);
create index idx_venta_items_venta on public.venta_items (venta_id);
create index idx_venta_items_producto on public.venta_items (producto_id);
create index idx_pagos_venta on public.pagos (venta_id);
create index idx_pagos_empresa_fecha on public.pagos (empresa_id, fecha desc);
create index idx_venta_cambios_venta on public.venta_cambios (venta_id);

-- ── Permisos: se lee por empresa; se escribe solo por funciones ─────────────

alter table public.folios_documentos enable row level security;
alter table public.ventas            enable row level security;
alter table public.venta_items       enable row level security;
alter table public.pagos             enable row level security;
alter table public.venta_cambios     enable row level security;

create policy folios_documentos_select on public.folios_documentos for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));
create policy ventas_select on public.ventas for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));
create policy venta_items_select on public.venta_items for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));
create policy pagos_select on public.pagos for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));
create policy venta_cambios_select on public.venta_cambios for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));

revoke all on public.folios_documentos, public.ventas, public.venta_items, public.pagos, public.venta_cambios
  from public, anon, authenticated;
grant select on public.folios_documentos, public.ventas, public.venta_items, public.pagos, public.venta_cambios
  to authenticated;

-- ── Funciones internas (no se pueden llamar por la API) ─────────────────────

-- Valida las líneas, recalcula importes y liga cada una a su producto por código.
create function public.normalizar_items_documento(p_items jsonb, p_empresa_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_max_monto constant numeric := 99999999.99;  -- numeric(10,2)
  v_item      jsonb;
  v_orden     int := 0;
  v_desc      text;
  v_sku       text;
  v_id        uuid;
  v_producto  uuid;
  v_cantidad  numeric;
  v_precio    numeric;
  v_salida    jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un ítem.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Un documento admite como máximo 200 ítems.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_desc := btrim(coalesce(v_item->>'descripcion', ''));
    if v_desc = '' then
      raise exception 'Hay un ítem sin descripción.' using errcode = '22023';
    end if;
    if length(v_desc) > 500 then
      raise exception 'La descripción "%" supera los 500 caracteres.', left(v_desc, 40) using errcode = '22023';
    end if;
    if jsonb_typeof(v_item->'cantidad') is distinct from 'number'
       or jsonb_typeof(v_item->'precio_unitario') is distinct from 'number' then
      raise exception 'Cantidad o precio inválido en "%".', v_desc using errcode = '22023';
    end if;

    v_cantidad := round((v_item->>'cantidad')::numeric, 4);
    v_precio   := round((v_item->>'precio_unitario')::numeric, 4);
    if v_cantidad <= 0 or v_precio < 0 then
      raise exception 'En "%" la cantidad debe ser mayor a 0 y el precio no puede ser negativo.', v_desc
        using errcode = '22023';
    end if;
    if v_cantidad > c_max_monto or v_precio > c_max_monto then
      raise exception 'Cantidad o precio demasiado grande en "%".', v_desc using errcode = '22023';
    end if;

    v_sku := nullif(btrim(coalesce(v_item->>'sku', '')), '');
    v_producto := null;
    if v_sku is not null then
      select id into v_producto from public.productos where empresa_id = p_empresa_id and codigo_sku = v_sku;
    end if;
    v_id := case when coalesce(v_item->>'id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 then (v_item->>'id')::uuid end;

    v_salida := v_salida || jsonb_build_array(jsonb_build_object(
      'id',              v_id,
      'producto_id',     v_producto,
      'sku',             v_sku,
      'descripcion',     v_desc,
      -- Muchas líneas viejas no tienen unidad: la del producto, o la que más usa la empresa.
      'unidad',          coalesce(
                           nullif(btrim(coalesce(v_item->>'unidad', '')), ''),
                           (select nullif(btrim(p.unidad), '') from public.productos p where p.id = v_producto),
                           (select p.unidad from public.productos p
                             where p.empresa_id = p_empresa_id and nullif(btrim(p.unidad), '') is not null
                             group by p.unidad order by count(*) desc, p.unidad limit 1),
                           'und'),
      'cantidad',        v_cantidad,
      'precio_unitario', v_precio,
      'importe',         round(v_cantidad * v_precio, 2),
      'orden',           v_orden
    ));
    v_orden := v_orden + 1;
  end loop;

  return v_salida;
end;
$$;

-- Mismo cálculo que crear_cotizacion() y que calcularTotales() en el frontend.
create function public.totales_documento(
  p_items jsonb,
  p_descuento numeric,
  p_incluye_igv boolean,
  p_precios_con_igv boolean,
  out subtotal numeric,
  out descuento numeric,
  out igv numeric,
  out total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_tasa_igv  constant numeric := 0.18;
  c_max_monto constant numeric := 99999999.99;
  v_neto      numeric;
begin
  if p_precios_con_igv and not p_incluye_igv then
    raise exception 'Si los precios ya incluyen IGV, el documento no puede ser sin IGV.' using errcode = '22023';
  end if;
  subtotal  := round((select coalesce(sum((value->>'importe')::numeric), 0) from jsonb_array_elements(p_items)), 2);
  descuento := round(coalesce(p_descuento, 0), 2);
  if descuento < 0 then
    raise exception 'El descuento no puede ser negativo.' using errcode = '22023';
  end if;
  if descuento > subtotal then
    raise exception 'El descuento no puede ser mayor que el subtotal.' using errcode = '22023';
  end if;
  v_neto := subtotal - descuento;
  igv := case
           when p_precios_con_igv then round(v_neto * c_tasa_igv / (1 + c_tasa_igv), 2)
           when p_incluye_igv then round(v_neto * c_tasa_igv, 2)
           else 0
         end;
  total := case when p_incluye_igv and not p_precios_con_igv then v_neto + igv else v_neto end;
  if total > c_max_monto then
    raise exception 'El total supera el máximo permitido (S/ 99,999,999.99).' using errcode = '22023';
  end if;
end;
$$;

-- Registra el pago y recalcula lo pagado. El llamador ya validó permisos y bloqueó la venta.
create function public.insertar_pago(
  p_venta public.ventas,
  p_monto numeric,
  p_metodo text,
  p_fecha date,
  p_referencia text,
  p_nota text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monto  numeric := round(coalesce(p_monto, 0), 2);
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_fecha  date := coalesce(p_fecha, v_hoy);
  v_nombre text;
begin
  if v_monto <= 0 then
    raise exception 'El pago debe ser mayor a 0.' using errcode = '22023';
  end if;
  if v_monto > p_venta.saldo then
    raise exception 'El pago de S/ % supera el saldo de S/ %.', v_monto, p_venta.saldo using errcode = '22023';
  end if;
  if coalesce(p_metodo, '') not in ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE_PLIN', 'CHEQUE', 'OTRO') then
    raise exception 'Elige cómo se recibió el pago.' using errcode = '22023';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha del pago no puede ser futura.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();

  insert into public.pagos (venta_id, empresa_id, fecha, monto, metodo, referencia, nota, creado_por, creado_por_nombre)
  values (p_venta.id, p_venta.empresa_id, v_fecha, v_monto, p_metodo,
          nullif(btrim(coalesce(p_referencia, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''),
          auth.uid(), v_nombre);

  update public.ventas set pagado = pagado + v_monto where id = p_venta.id;
end;
$$;

-- La venta con sus líneas, pagos e historial: lo que devuelve cada operación.
create function public.venta_json(p_venta_id uuid)
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

-- Crea la venta con su folio, cliente, líneas y adelanto. El llamador ya validó permisos.
create function public.insertar_venta(
  p_empresa_id      text,
  p_cliente         jsonb,
  p_items           jsonb,
  p_incluye_igv     boolean,
  p_precios_con_igv boolean,
  p_descuento       numeric,
  p_lugar_entrega   text,
  p_observaciones   text,
  p_condiciones     jsonb,
  p_condicion_pago  text,
  p_dias_credito    integer,
  p_fecha           date,
  p_adelanto        jsonb,
  p_estado_entrega  text,
  p_cotizacion_id   uuid,
  p_folio_cotizacion text,
  p_guardar_cliente boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_hoy        date := (now() at time zone 'America/Lima')::date;
  v_fecha      date := coalesce(p_fecha, v_hoy);
  v_empresa    public.empresas%rowtype;
  v_nombre     text := btrim(coalesce(p_cliente->>'nombre', ''));
  v_documento  text := btrim(coalesce(p_cliente->>'documento', ''));
  v_telefono   text := nullif(btrim(coalesce(p_cliente->>'telefono', '')), '');
  v_direccion  text := nullif(btrim(coalesce(p_cliente->>'direccion', '')), '');
  v_correo     text := nullif(btrim(coalesce(p_cliente->>'correo', '')), '');
  v_obs        text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_lugar      text := nullif(btrim(coalesce(p_lugar_entrega, '')), '');
  v_incluye    boolean := coalesce(p_incluye_igv, true);
  v_con_igv    boolean := coalesce(p_precios_con_igv, false);
  v_condicion  text := coalesce(p_condicion_pago, 'CONTADO');
  v_items      jsonb;
  v_totales    record;
  v_cliente_id uuid;
  v_prefijo    text;
  v_secuencia  int;
  v_folio      text;
  v_correo_vendedor text;
  v_nombre_vendedor text;
  v_venta      public.ventas%rowtype;
begin
  select * into v_empresa from public.empresas where id = p_empresa_id;
  if not found or v_empresa.activa is false then
    raise exception 'La empresa no existe o está desactivada.';
  end if;

  if v_nombre = '' then
    raise exception 'El cliente necesita nombre.' using errcode = '22023';
  end if;
  if v_documento !~ '^(\d{8}|\d{11})$' then
    raise exception 'Una venta necesita un RUC de 11 dígitos o un DNI de 8.' using errcode = '22023';
  end if;
  if length(v_nombre) > 255 or length(coalesce(v_lugar, '')) > 100 or length(coalesce(v_obs, '')) > 2000
     or length(coalesce(v_direccion, '')) > 500 or length(coalesce(v_correo, '')) > 255
     or length(coalesce(v_telefono, '')) > 50 then
    raise exception 'Algún dato del cliente o de la venta es demasiado largo.' using errcode = '22023';
  end if;

  if v_fecha > v_hoy then
    raise exception 'La fecha de la venta no puede ser futura.' using errcode = '22023';
  end if;
  if v_condicion not in ('CONTADO', 'CREDITO') then
    raise exception 'Condición de pago inválida.' using errcode = '22023';
  end if;
  if v_condicion = 'CREDITO' and p_dias_credito is not null and p_dias_credito not between 1 and 365 then
    raise exception 'Los días de crédito deben estar entre 1 y 365.' using errcode = '22023';
  end if;
  if coalesce(p_estado_entrega, 'PENDIENTE') not in ('PENDIENTE', 'PARCIAL', 'ENTREGADA') then
    raise exception 'Estado de entrega inválido.' using errcode = '22023';
  end if;

  v_items := public.normalizar_items_documento(p_items, p_empresa_id);
  select * into v_totales from public.totales_documento(v_items, p_descuento, v_incluye, v_con_igv);

  if coalesce(p_guardar_cliente, true) then
    insert into public.clientes as c
      (empresa_id, documento_identidad, nombre_razon_social, telefono, direccion, correo)
    values (p_empresa_id, v_documento, v_nombre, v_telefono, v_direccion, v_correo)
    on conflict (empresa_id, documento_identidad) do update set
      nombre_razon_social = excluded.nombre_razon_social,
      telefono  = coalesce(excluded.telefono,  c.telefono),
      direccion = coalesce(excluded.direccion, c.direccion),
      correo    = coalesce(excluded.correo,    c.correo)
    returning id into v_cliente_id;
  else
    select id into v_cliente_id from public.clientes
     where empresa_id = p_empresa_id and documento_identidad = v_documento;
  end if;

  -- Folio: el contador queda bloqueado hasta el commit.
  v_prefijo := coalesce(nullif(btrim(v_empresa.prefijo), ''), upper(left(p_empresa_id, 3)));
  loop
    insert into public.folios_documentos as f (empresa_id, tipo, secuencia)
    values (p_empresa_id, 'VENTA', 1)
    on conflict (empresa_id, tipo) do update set secuencia = f.secuencia + 1
    returning secuencia into v_secuencia;
    v_folio := v_prefijo || '-V-' || lpad(v_secuencia::text, 8, '0');
    exit when not exists (select 1 from public.ventas where empresa_id = p_empresa_id and folio = v_folio);
  end loop;

  select email, nullif(btrim(nombre), '') into v_correo_vendedor, v_nombre_vendedor
    from public.profiles where id = v_uid;

  insert into public.ventas (
    folio, fecha, empresa_id, estado_entrega,
    cliente_id, cliente_nombre, cliente_documento, cliente_telefono, cliente_direccion, cliente_correo,
    subtotal, descuento_global, igv, total, incluye_igv, precios_con_igv,
    condicion_pago, dias_credito, vence_el,
    lugar_entrega, observaciones, condiciones,
    cotizacion_id, folio_cotizacion, vendedor, vendedor_nombre, creado_por
  ) values (
    v_folio, v_fecha, p_empresa_id, coalesce(p_estado_entrega, 'PENDIENTE'),
    v_cliente_id, v_nombre, v_documento, v_telefono, v_direccion, v_correo,
    v_totales.subtotal, v_totales.descuento, v_totales.igv, v_totales.total, v_incluye, v_con_igv,
    v_condicion,
    case when v_condicion = 'CREDITO' then p_dias_credito end,
    case when v_condicion = 'CREDITO' and p_dias_credito is not null then v_fecha + p_dias_credito end,
    v_lugar, v_obs,
    -- Sin validez: ya es una venta. Lo que no venga lo decide la empresa al imprimir.
    jsonb_strip_nulls(jsonb_build_object(
      'mostrarValidez', false,
      'mostrarCuentas', case when jsonb_typeof(p_condiciones->'mostrarCuentas') = 'boolean' then p_condiciones->'mostrarCuentas' end
    )),
    p_cotizacion_id, p_folio_cotizacion, coalesce(v_correo_vendedor, auth.jwt()->>'email'), v_nombre_vendedor, v_uid
  )
  returning * into v_venta;

  insert into public.venta_items (venta_id, empresa_id, producto_id, sku, descripcion, unidad, cantidad, precio_unitario, importe, orden)
  select v_venta.id, p_empresa_id, (i->>'producto_id')::uuid, i->>'sku', i->>'descripcion', i->>'unidad',
         (i->>'cantidad')::numeric, (i->>'precio_unitario')::numeric, (i->>'importe')::numeric, (i->>'orden')::int
    from jsonb_array_elements(v_items) i;

  -- Lo que se recibió al momento de vender.
  if p_adelanto is not null and coalesce((p_adelanto->>'monto')::numeric, 0) > 0 then
    perform public.insertar_pago(v_venta, (p_adelanto->>'monto')::numeric, p_adelanto->>'metodo',
                                 v_fecha, p_adelanto->>'referencia', null);
  end if;

  return v_venta.id;
end;
$$;

revoke all on function public.normalizar_items_documento(jsonb, text) from public, anon, authenticated;
revoke all on function public.totales_documento(jsonb, numeric, boolean, boolean) from public, anon, authenticated;
revoke all on function public.insertar_pago(public.ventas, numeric, text, date, text, text) from public, anon, authenticated;
revoke all on function public.venta_json(uuid) from public, anon, authenticated;
revoke all on function public.insertar_venta(text, jsonb, jsonb, boolean, boolean, numeric, text, text, jsonb, text, integer, date, jsonb, text, uuid, text, boolean)
  from public, anon, authenticated;

-- ── Funciones públicas ─────────────────────────────────────────────────────

create function public.crear_venta(
  p_empresa_id      text,
  p_cliente         jsonb,
  p_items           jsonb,
  p_incluye_igv     boolean default true,
  p_precios_con_igv boolean default false,
  p_descuento       numeric default 0,
  p_lugar_entrega   text    default null,
  p_observaciones   text    default null,
  p_condiciones     jsonb   default '{}'::jsonb,
  p_condicion_pago  text    default 'CONTADO',
  p_dias_credito    integer default null,
  p_fecha           date    default null,
  p_adelanto        jsonb   default null,
  p_estado_entrega  text    default 'PENDIENTE',
  p_guardar_cliente boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lugar    text := nullif(btrim(coalesce(p_lugar_entrega, '')), '');
  v_lugares  text[];
  v_id       uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para registrar ventas.' using errcode = '42501';
  end if;
  if not public.tiene_acceso_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.' using errcode = '42501';
  end if;

  -- Lugar de entrega: una de las opciones de la empresa, o ninguno si no tiene.
  select lugares_entrega into v_lugares from public.empresas where id = p_empresa_id;
  if coalesce(cardinality(v_lugares), 0) = 0 then
    v_lugar := null;
  elsif v_lugar is not null and not (v_lugar = any (v_lugares)) then
    raise exception 'El lugar de entrega "%" no es una de las opciones de la empresa.', v_lugar using errcode = '22023';
  end if;

  v_id := public.insertar_venta(p_empresa_id, p_cliente, p_items, p_incluye_igv, p_precios_con_igv, p_descuento,
                                v_lugar, p_observaciones, p_condiciones, p_condicion_pago, p_dias_credito, p_fecha,
                                p_adelanto, p_estado_entrega, null, null, p_guardar_cliente);
  return public.venta_json(v_id);
end;
$$;

-- Toma los datos de la cotización guardada: lo vendido es lo que se cotizó. Las
-- cotizaciones no exigían un RUC o DNI válido; si falta, se completa con p_documento.
create function public.convertir_cotizacion_en_venta(
  p_cotizacion_id  uuid,
  p_condicion_pago text    default 'CONTADO',
  p_dias_credito   integer default null,
  p_fecha          date    default null,
  p_adelanto       jsonb   default null,
  p_estado_entrega text    default 'PENDIENTE',
  p_documento      text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot       public.cotizaciones%rowtype;
  v_venta     text;
  v_id        uuid;
  v_documento text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para registrar ventas.' using errcode = '42501';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found or not public.tiene_acceso_empresa(v_cot.empresa_id) then
    raise exception 'La cotización no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_cot.estado = 'ANULADA' then
    raise exception 'La cotización % está anulada. Duplícala para venderla.', v_cot.folio;
  end if;
  select folio into v_venta from public.ventas where cotizacion_id = v_cot.id and estado = 'ACTIVA';
  if found then
    raise exception 'La cotización % ya es la venta %.', v_cot.folio, v_venta;
  end if;

  v_documento := coalesce(nullif(btrim(coalesce(p_documento, '')), ''), v_cot.cliente_documento);

  -- La cotización puede ser de hace semanas: suma el cliente que falta, pero no
  -- pisa los datos de uno que ya está en la cartera.
  if v_documento ~ '^(\d{8}|\d{11})$' then
    insert into public.clientes (empresa_id, documento_identidad, nombre_razon_social, telefono, direccion, correo)
    values (v_cot.empresa_id, v_documento, v_cot.cliente_nombre, v_cot.cliente_telefono, v_cot.cliente_direccion, v_cot.cliente_correo)
    on conflict (empresa_id, documento_identidad) do nothing;
  end if;

  v_id := public.insertar_venta(
    v_cot.empresa_id,
    jsonb_build_object('nombre', v_cot.cliente_nombre, 'documento', v_documento,
                       'telefono', v_cot.cliente_telefono, 'direccion', v_cot.cliente_direccion, 'correo', v_cot.cliente_correo),
    v_cot.items, coalesce(v_cot.incluye_igv, v_cot.igv > 0), v_cot.precios_con_igv, v_cot.descuento_global,
    v_cot.lugar_entrega, v_cot.observaciones, v_cot.condiciones,
    p_condicion_pago, p_dias_credito, p_fecha, p_adelanto, p_estado_entrega, v_cot.id, v_cot.folio, false
  );

  if v_cot.estado = 'PENDIENTE' then
    update public.cotizaciones set estado = 'APROBADA' where id = v_cot.id;
  end if;

  return public.venta_json(v_id);
end;
$$;

create function public.registrar_pago(
  p_venta_id   uuid,
  p_monto      numeric,
  p_metodo     text,
  p_fecha      date default null,
  p_referencia text default null,
  p_nota       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para registrar pagos.' using errcode = '42501';
  end if;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or not public.tiene_acceso_empresa(v_venta.empresa_id) then
    raise exception 'La venta no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_venta.estado <> 'ACTIVA' then
    raise exception 'La venta % está anulada.', v_venta.folio;
  end if;

  perform public.insertar_pago(v_venta, p_monto, p_metodo, p_fecha, p_referencia, p_nota);
  return public.venta_json(p_venta_id);
end;
$$;

create function public.anular_pago(p_pago_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago   public.pagos%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nombre text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para anular pagos.' using errcode = '42501';
  end if;
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found or not public.es_admin_de_empresa(v_pago.empresa_id) then
    raise exception 'Solo un admin de la empresa puede anular pagos.' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Indica por qué se anula el pago.' using errcode = '22023';
  end if;
  perform 1 from public.ventas where id = v_pago.venta_id for update;
  select * into v_pago from public.pagos where id = p_pago_id;
  if v_pago.anulado then
    raise exception 'Ese pago ya está anulado.';
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();

  update public.pagos
     set anulado = true, anulado_en = now(), anulado_por = auth.uid(), anulado_por_nombre = v_nombre, motivo_anulacion = v_motivo
   where id = p_pago_id;
  update public.ventas set pagado = pagado - v_pago.monto where id = v_pago.venta_id;

  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle, motivo)
  values (v_pago.venta_id, v_pago.empresa_id, auth.uid(), v_nombre, 'PAGO_ANULADO',
          jsonb_build_object('monto', v_pago.monto, 'fecha', v_pago.fecha, 'metodo', v_pago.metodo), v_motivo);

  return public.venta_json(v_pago.venta_id);
end;
$$;

-- Cambia líneas, descuento, IGV y condiciones sin cambiar de folio. Las líneas que
-- llegan con id se actualizan (conservan su identidad para las salidas de la Fase 3).
create function public.ajustar_venta(
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

-- Con pagos vigentes no se anula: primero se anulan, así el dinero nunca desaparece solo.
create function public.anular_venta(p_venta_id uuid, p_motivo text)
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

create function public.marcar_entrega_venta(p_venta_id uuid, p_estado text)
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

revoke all on function public.crear_venta(text, jsonb, jsonb, boolean, boolean, numeric, text, text, jsonb, text, integer, date, jsonb, text, boolean) from public, anon;
revoke all on function public.convertir_cotizacion_en_venta(uuid, text, integer, date, jsonb, text, text) from public, anon;
revoke all on function public.registrar_pago(uuid, numeric, text, date, text, text) from public, anon;
revoke all on function public.anular_pago(uuid, text) from public, anon;
revoke all on function public.ajustar_venta(uuid, jsonb, boolean, boolean, numeric, text, text, text, integer, text, date) from public, anon;
revoke all on function public.anular_venta(uuid, text) from public, anon;
revoke all on function public.marcar_entrega_venta(uuid, text) from public, anon;
revoke all on function public.guardar_comprobante_venta(uuid, text, text) from public, anon;

grant execute on function public.crear_venta(text, jsonb, jsonb, boolean, boolean, numeric, text, text, jsonb, text, integer, date, jsonb, text, boolean) to authenticated, service_role;
grant execute on function public.convertir_cotizacion_en_venta(uuid, text, integer, date, jsonb, text, text) to authenticated, service_role;
grant execute on function public.registrar_pago(uuid, numeric, text, date, text, text) to authenticated, service_role;
grant execute on function public.anular_pago(uuid, text) to authenticated, service_role;
grant execute on function public.ajustar_venta(uuid, jsonb, boolean, boolean, numeric, text, text, text, integer, text, date) to authenticated, service_role;
grant execute on function public.anular_venta(uuid, text) to authenticated, service_role;
grant execute on function public.marcar_entrega_venta(uuid, text) to authenticated, service_role;
grant execute on function public.guardar_comprobante_venta(uuid, text, text) to authenticated, service_role;

-- ── Una cotización convertida no cambia de estado mientras exista su venta ──

create or replace function public.controlar_cambio_estado_cotizacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision text;
  v_venta    text;
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

  if old.estado = 'APROBADA' then
    select folio into v_venta from public.ventas where cotizacion_id = old.id and estado = 'ACTIVA';
    if found then
      raise exception 'La cotización % ya es la venta %. Para cambiarla, anula primero esa venta.', old.folio, v_venta;
    end if;
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre
    from public.profiles where id = auth.uid();
  new.estado_cambiado_en := now();
  new.estado_cambiado_por := auth.uid();
  new.estado_cambiado_por_nombre := v_nombre;
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
