-- Cotizaciones atómicas: el servidor asigna el folio, calcula los totales y
-- resuelve las revisiones en una sola transacción.
--
-- Antes:
--   * El navegador pedía el folio (getnextfolioempresa) y luego insertaba la
--     cotización en otra llamada. Si la primera fallaba, inventaba un folio
--     (quedan registros como COT-20260424-1529).
--   * Subtotal, IGV y total los calculaba el navegador y la BD los guardaba
--     sin verificar.
--   * Al revisar una cotización, el historial la anulaba ANTES de abrir el
--     cotizador: si la revisión no se guardaba, el cliente se quedaba sin
--     ninguna cotización vigente.
--   * "Incluye IGV" y las condiciones del PDF no se guardaban, así que el PDF
--     descargado desde el historial salía distinto al original.
--
-- Después: crear_cotizacion() hace todo o nada. Esta migración solo agrega;
-- el código actual sigue funcionando. La siguiente
-- (20261029030000_cotizaciones_solo_por_funcion.sql) cierra la escritura
-- directa una vez desplegado el frontend nuevo.
--
-- Reversible con supabase/rollbacks/20261029020000_cotizaciones_atomicas.rollback.sql

begin;

-- ── Columnas nuevas ────────────────────────────────────────────────────────

alter table public.cotizaciones
  add column incluye_igv boolean not null default true,
  add column condiciones jsonb not null default '{}'::jsonb,
  add column cotizacion_origen_id uuid,
  add column tipo_origen text,
  -- Copia del folio original para el PDF y el historial: los folios no
  -- cambian, y así se muestra aunque la original esté en otra empresa.
  add column folio_origen text,
  add column creado_por uuid;

alter table public.cotizaciones
  add constraint fk_cotizaciones_origen
    foreign key (cotizacion_origen_id) references public.cotizaciones(id) on delete set null,
  add constraint fk_cotizaciones_creado_por
    foreign key (creado_por) references public.profiles(id) on delete set null,
  add constraint cotizaciones_tipo_origen_check
    check (tipo_origen in ('revision', 'duplicado')),
  add constraint cotizaciones_origen_con_tipo_check
    check (cotizacion_origen_id is null or tipo_origen is not null);

-- ── Datos existentes ───────────────────────────────────────────────────────

update public.cotizaciones set incluye_igv = (igv > 0);

-- Las revisiones y duplicados viejos solo dejaban una nota en observaciones.
update public.cotizaciones c
   set cotizacion_origen_id = o.id,
       folio_origen = o.folio,
       tipo_origen = case when c.observaciones like '[Revisión de %' then 'revision' else 'duplicado' end
  from public.cotizaciones o
 where (c.observaciones like '[Revisión de %' or c.observaciones like '[Duplicado de %')
   and o.folio = substring(c.observaciones from '^\[(?:Revisión|Duplicado) de ([^\]]+)\]')
   and o.id <> c.id
   and (select count(*) from public.cotizaciones x where x.folio = o.folio) = 1;

update public.cotizaciones c
   set creado_por = p.id
  from public.profiles p
 where lower(c.vendedor) = lower(p.email);

-- Una cotización solo puede tener una revisión vigente.
create unique index uq_cotizaciones_una_revision
  on public.cotizaciones (cotizacion_origen_id) where tipo_origen = 'revision';

create index idx_cotizaciones_origen
  on public.cotizaciones (cotizacion_origen_id) where cotizacion_origen_id is not null;

-- ── crear_cotizacion ───────────────────────────────────────────────────────
-- SECURITY DEFINER porque, tras la siguiente migración, `authenticated` ya no
-- puede insertar directamente. Por eso cada acceso se verifica a mano.

create function public.crear_cotizacion(
  p_empresa_id      text,
  p_cliente         jsonb,
  p_items           jsonb,
  p_incluye_igv     boolean default true,
  p_lugar_entrega   text    default null,
  p_observaciones   text    default null,
  p_condiciones     jsonb   default '{}'::jsonb,
  p_origen_id       uuid    default null,
  p_tipo_origen     text    default null,
  p_guardar_cliente boolean default true
)
returns public.cotizaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tasa_igv   constant numeric := 0.18;
  c_max_monto  constant numeric := 99999999.99;  -- numeric(10,2)

  v_uid        uuid := auth.uid();
  v_empresa    public.empresas%rowtype;
  v_origen     public.cotizaciones%rowtype;
  v_revision   text;

  v_nombre     text := btrim(coalesce(p_cliente->>'nombre', ''));
  v_documento  text := btrim(coalesce(p_cliente->>'documento', ''));
  v_telefono   text := nullif(btrim(coalesce(p_cliente->>'telefono', '')), '');
  v_direccion  text := nullif(btrim(coalesce(p_cliente->>'direccion', '')), '');
  v_correo     text := nullif(btrim(coalesce(p_cliente->>'correo', '')), '');
  v_lugar      text := nullif(btrim(coalesce(p_lugar_entrega, '')), '');
  v_obs        text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_cliente_id uuid;

  v_item       jsonb;
  v_desc       text;
  v_cantidad   numeric;
  v_precio     numeric;
  v_importe    numeric;
  v_items      jsonb := '[]'::jsonb;
  v_subtotal   numeric := 0;
  v_igv        numeric;

  v_dias       int;
  v_condiciones jsonb;

  v_prefijo    text;
  v_secuencia  int;
  v_folio      text;
  v_vendedor   text;
  v_nueva      public.cotizaciones%rowtype;
begin
  -- Sesión y empresa
  if v_uid is null then
    raise exception 'Inicia sesión para crear cotizaciones.' using errcode = '42501';
  end if;
  if not public.tiene_acceso_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.' using errcode = '42501';
  end if;
  select * into v_empresa from public.empresas where id = p_empresa_id;
  if not found or v_empresa.activa is false then
    raise exception 'La empresa no existe o está desactivada.';
  end if;

  -- Cliente
  if v_nombre = '' or v_documento = '' then
    raise exception 'El cliente necesita nombre y RUC/DNI.' using errcode = '22023';
  end if;
  if length(v_nombre) > 255 then
    raise exception 'El nombre del cliente supera los 255 caracteres.' using errcode = '22023';
  end if;
  if length(v_documento) > 20 then
    raise exception 'El RUC/DNI supera los 20 caracteres.' using errcode = '22023';
  end if;
  if length(coalesce(v_lugar, '')) > 100 or length(coalesce(v_obs, '')) > 2000
     or length(coalesce(v_direccion, '')) > 500 or length(coalesce(v_correo, '')) > 255
     or length(coalesce(v_telefono, '')) > 50 then
    raise exception 'Algún dato del cliente o de la cotización es demasiado largo.' using errcode = '22023';
  end if;

  -- Ítems: se recalcula todo; lo que mande el navegador como subtotal se ignora.
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Agrega al menos un ítem.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un ítem.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Una cotización admite como máximo 200 ítems.' using errcode = '22023';
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

    v_importe  := round(v_cantidad * v_precio, 2);
    v_subtotal := v_subtotal + v_importe;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'sku',             nullif(btrim(coalesce(v_item->>'sku', '')), ''),
      'descripcion',     v_desc,
      'unidad',          coalesce(nullif(btrim(coalesce(v_item->>'unidad', '')), ''), 'und'),
      'cantidad',        v_cantidad,
      'precio_unitario', v_precio,
      'subtotal',        v_importe
    )));
  end loop;

  v_igv := case when coalesce(p_incluye_igv, true) then round(v_subtotal * c_tasa_igv, 2) else 0 end;
  if v_subtotal + v_igv > c_max_monto then
    raise exception 'El total supera el máximo permitido (S/ 99,999,999.99).' using errcode = '22023';
  end if;

  -- Condiciones del PDF: solo las claves conocidas y con tipos válidos.
  if coalesce(p_condiciones->>'diasValidez', '') ~ '^\d{1,3}$' then
    v_dias := (p_condiciones->>'diasValidez')::int;
  end if;
  v_condiciones := jsonb_build_object(
    'mostrarValidez',  case when jsonb_typeof(p_condiciones->'mostrarValidez')  = 'boolean'
                            then (p_condiciones->'mostrarValidez')::boolean  else true  end,
    'diasValidez',     case when v_dias between 1 and 365 then v_dias else 15 end,
    'mostrarCuentas',  case when jsonb_typeof(p_condiciones->'mostrarCuentas')  = 'boolean'
                            then (p_condiciones->'mostrarCuentas')::boolean  else true  end,
    'mostrarContacto', case when jsonb_typeof(p_condiciones->'mostrarContacto') = 'boolean'
                            then (p_condiciones->'mostrarContacto')::boolean else false end
  );

  -- Origen (revisión o duplicado). Se bloquea la fila para que dos personas
  -- no revisen la misma cotización a la vez.
  if p_origen_id is not null then
    if p_tipo_origen is null or p_tipo_origen not in ('revision', 'duplicado') then
      raise exception 'Tipo de origen inválido.' using errcode = '22023';
    end if;
    select * into v_origen from public.cotizaciones where id = p_origen_id for update;
    if not found or not public.tiene_acceso_empresa(v_origen.empresa_id) then
      raise exception 'La cotización original no existe o no tienes acceso.' using errcode = '42501';
    end if;
    if p_tipo_origen = 'revision' then
      select folio into v_revision from public.cotizaciones
       where cotizacion_origen_id = p_origen_id and tipo_origen = 'revision';
      if found then
        raise exception 'La cotización % ya fue reemplazada por la revisión %.', v_origen.folio, v_revision;
      end if;
    end if;
  elsif p_tipo_origen is not null then
    raise exception 'Falta indicar la cotización original.' using errcode = '22023';
  end if;

  -- Cliente en la cartera de la empresa
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

  -- Folio: el contador queda bloqueado hasta el commit, así que dos
  -- cotizaciones simultáneas nunca reciben el mismo número. Si la secuencia
  -- quedó detrás de un folio ya usado, se salta.
  v_prefijo := coalesce(nullif(btrim(v_empresa.prefijo), ''), upper(left(p_empresa_id, 3)));
  loop
    insert into public.folios_empresas as f (empresa_codigo, secuencia)
    values (p_empresa_id, 1)
    on conflict (empresa_codigo) do update set secuencia = coalesce(f.secuencia, 0) + 1
    returning secuencia into v_secuencia;
    v_folio := v_prefijo || '-' || lpad(v_secuencia::text, 8, '0');
    exit when not exists (
      select 1 from public.cotizaciones where empresa_id = p_empresa_id and folio = v_folio
    );
  end loop;

  select email into v_vendedor from public.profiles where id = v_uid;

  insert into public.cotizaciones (
    folio, fecha, empresa_id, estado,
    cliente_id, cliente_nombre, cliente_documento, cliente_telefono, cliente_direccion, cliente_correo,
    items, subtotal, igv, total, incluye_igv,
    lugar_entrega, observaciones, condiciones, vendedor, creado_por,
    cotizacion_origen_id, tipo_origen, folio_origen
  ) values (
    v_folio, now(), p_empresa_id, 'PENDIENTE',
    v_cliente_id, v_nombre, v_documento, v_telefono, v_direccion, v_correo,
    v_items, round(v_subtotal, 2), v_igv, round(v_subtotal, 2) + v_igv, coalesce(p_incluye_igv, true),
    v_lugar, v_obs, v_condiciones, coalesce(v_vendedor, auth.jwt()->>'email'), v_uid,
    p_origen_id, case when p_origen_id is not null then p_tipo_origen end, v_origen.folio
  )
  returning * into v_nueva;

  -- La original se anula solo si la revisión ya quedó guardada.
  if p_tipo_origen = 'revision' then
    update public.cotizaciones set estado = 'ANULADA' where id = p_origen_id;
  end if;

  return v_nueva;
end;
$$;

revoke all on function public.crear_cotizacion(text, jsonb, jsonb, boolean, text, text, jsonb, uuid, text, boolean)
  from public, anon;
grant execute on function public.crear_cotizacion(text, jsonb, jsonb, boolean, text, text, jsonb, uuid, text, boolean)
  to authenticated, service_role;

-- ── Una cotización reemplazada por una revisión no se puede reactivar ──────
-- SECURITY DEFINER para ver la revisión aunque esté en otra empresa.

create function public.proteger_cotizacion_revisada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision text;
begin
  if old.estado = 'ANULADA' and new.estado is distinct from 'ANULADA' then
    select folio into v_revision from public.cotizaciones
     where cotizacion_origen_id = old.id and tipo_origen = 'revision';
    if found then
      raise exception 'La cotización % fue reemplazada por la revisión %; no se puede reactivar.',
        old.folio, v_revision;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_cotizacion_revisada() from public, anon, authenticated;

create trigger trg_proteger_cotizacion_revisada
  before update of estado on public.cotizaciones
  for each row execute function public.proteger_cotizacion_revisada();

commit;
