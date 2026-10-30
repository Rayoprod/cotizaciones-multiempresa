-- IGV en tres modos, descuento global, reglas de revisión y registro de estados.
--
-- IGV. Además de sumar el 18% o no cobrarlo, los precios pueden venir con el IGV
-- incluido (precios_con_igv, el mismo nombre que en SIGO-WM):
--
--   incluye_igv  precios_con_igv  total            igv
--   true         false            neto + 18%       18% del neto
--   true         true             neto             lo que el neto lleva dentro
--   false        false            neto             0
--
-- `subtotal` sigue siendo la suma de los ítems y neto = subtotal - descuento_global.
-- Cada empresa define el modo con el que abre una cotización nueva (modo_igv).
--
-- Revisiones. Solo se revisa lo que está Pendiente: Aprobada y Anulada solo se
-- duplican. Revisar y duplicar ocurren dentro de la misma empresa.
--
-- Estados. Pendiente pasa a Aprobada o Anulada; Aprobada vuelve a Pendiente o
-- pasa a Anulada; Anulada es definitivo. Se guarda quién hizo el último cambio.
--
-- Vendedor. El PDF imprime el nombre (profiles.nombre, copiado a la cotización
-- al crearla) y ya no el correo; `vendedor` sigue guardando el correo.
--
-- Solo agrega columnas: el frontend actual sigue funcionando hasta desplegar el nuevo.
-- Reversible con supabase/rollbacks/20261030050000_igv_descuento_y_reglas.rollback.sql

begin;

-- ── Columnas ───────────────────────────────────────────────────────────────

alter table public.cotizaciones
  add column precios_con_igv boolean not null default false,
  add column descuento_global numeric(10,2) not null default 0,
  add column vendedor_nombre text,
  add column estado_cambiado_en timestamptz,
  add column estado_cambiado_por uuid,
  -- Copia del nombre: un vendedor no puede leer el perfil de otras cuentas.
  add column estado_cambiado_por_nombre text;

alter table public.cotizaciones
  add constraint cotizaciones_precios_con_igv_check check (not precios_con_igv or incluye_igv),
  add constraint cotizaciones_descuento_check check (descuento_global >= 0 and descuento_global <= subtotal),
  add constraint fk_cotizaciones_estado_cambiado_por
    foreign key (estado_cambiado_por) references public.profiles(id) on delete set null;

alter table public.empresas
  add column modo_igv text not null default 'sumar'
    constraint empresas_modo_igv_check check (modo_igv in ('sumar', 'incluido', 'sin_igv'));

-- Las dos empresas que de verdad cotizan sin IGV (51 de sus 61 cotizaciones).
update public.empresas set modo_igv = 'sin_igv' where id in ('VDC', 'WM');

alter table public.profiles add column nombre text;

-- ── crear_cotizacion ───────────────────────────────────────────────────────
-- Cambia la lista de parámetros, por eso se reemplaza y no basta con "or replace".
-- Los nuevos tienen valor por defecto: el frontend actual la sigue llamando igual.

drop function public.crear_cotizacion(text, jsonb, jsonb, boolean, text, text, jsonb, uuid, text, boolean);

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
  p_guardar_cliente boolean default true,
  p_precios_con_igv boolean default false,
  p_descuento       numeric default 0
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
  v_incluye    boolean := coalesce(p_incluye_igv, true);
  v_con_igv    boolean := coalesce(p_precios_con_igv, false);
  v_descuento  numeric := round(coalesce(p_descuento, 0), 2);
  v_neto       numeric;
  v_igv        numeric;
  v_total      numeric;

  v_dias       int;
  v_condiciones jsonb;

  v_prefijo    text;
  v_secuencia  int;
  v_folio      text;
  v_vendedor   text;
  v_vendedor_nombre text;
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

  -- Lugar de entrega: una de las opciones de la empresa, o ninguno si no tiene.
  if coalesce(cardinality(v_empresa.lugares_entrega), 0) = 0 then
    v_lugar := null;
  elsif v_lugar is not null and not (v_lugar = any (v_empresa.lugares_entrega)) then
    raise exception 'El lugar de entrega "%" no es una de las opciones de la empresa.', v_lugar
      using errcode = '22023';
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

  -- Descuento e IGV. Con precios_con_igv el total es la suma de los ítems y el
  -- IGV solo informa cuánto lleva dentro.
  if v_con_igv and not v_incluye then
    raise exception 'Si los precios ya incluyen IGV, la cotización no puede ser sin IGV.' using errcode = '22023';
  end if;
  v_subtotal := round(v_subtotal, 2);
  if v_descuento < 0 then
    raise exception 'El descuento no puede ser negativo.' using errcode = '22023';
  end if;
  if v_descuento > v_subtotal then
    raise exception 'El descuento no puede ser mayor que el subtotal.' using errcode = '22023';
  end if;
  v_neto := v_subtotal - v_descuento;
  v_igv := case
             when v_con_igv then round(v_neto * c_tasa_igv / (1 + c_tasa_igv), 2)
             when v_incluye then round(v_neto * c_tasa_igv, 2)
             else 0
           end;
  v_total := case when v_incluye and not v_con_igv then v_neto + v_igv else v_neto end;
  if v_total > c_max_monto then
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
    if v_origen.empresa_id <> p_empresa_id then
      raise exception 'La cotización % es de otra empresa.', v_origen.folio using errcode = '22023';
    end if;
    if p_tipo_origen = 'revision' then
      select folio into v_revision from public.cotizaciones
       where cotizacion_origen_id = p_origen_id and tipo_origen = 'revision';
      if found then
        raise exception 'La cotización % ya fue reemplazada por la revisión %.', v_origen.folio, v_revision;
      end if;
      if v_origen.estado <> 'PENDIENTE' then
        raise exception 'Solo se puede revisar una cotización Pendiente, y % está %. Puedes duplicarla.',
          v_origen.folio, initcap(v_origen.estado);
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

  select email, nullif(btrim(nombre), '') into v_vendedor, v_vendedor_nombre
    from public.profiles where id = v_uid;

  insert into public.cotizaciones (
    folio, fecha, empresa_id, estado,
    cliente_id, cliente_nombre, cliente_documento, cliente_telefono, cliente_direccion, cliente_correo,
    items, subtotal, descuento_global, igv, total, incluye_igv, precios_con_igv,
    lugar_entrega, observaciones, condiciones, vendedor, vendedor_nombre, creado_por,
    cotizacion_origen_id, tipo_origen, folio_origen
  ) values (
    v_folio, now(), p_empresa_id, 'PENDIENTE',
    v_cliente_id, v_nombre, v_documento, v_telefono, v_direccion, v_correo,
    v_items, v_subtotal, v_descuento, v_igv, v_total, v_incluye, v_con_igv,
    v_lugar, v_obs, v_condiciones, coalesce(v_vendedor, auth.jwt()->>'email'), v_vendedor_nombre, v_uid,
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

revoke all on function public.crear_cotizacion(text, jsonb, jsonb, boolean, text, text, jsonb, uuid, text, boolean, boolean, numeric)
  from public, anon;
grant execute on function public.crear_cotizacion(text, jsonb, jsonb, boolean, text, text, jsonb, uuid, text, boolean, boolean, numeric)
  to authenticated, service_role;

-- ── Cambios de estado ──────────────────────────────────────────────────────
-- SECURITY DEFINER para leer el perfil y las revisiones sin depender de RLS.

drop trigger trg_proteger_cotizacion_revisada on public.cotizaciones;
drop function public.proteger_cotizacion_revisada();

create function public.controlar_cambio_estado_cotizacion()
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

revoke all on function public.controlar_cambio_estado_cotizacion() from public, anon, authenticated;

create trigger trg_controlar_cambio_estado_cotizacion
  before update of estado on public.cotizaciones
  for each row execute function public.controlar_cambio_estado_cotizacion();

notify pgrst, 'reload schema';

commit;
