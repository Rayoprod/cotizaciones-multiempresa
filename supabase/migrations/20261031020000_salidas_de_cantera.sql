-- Salidas de cantera: rol Encargado, módulos por empresa, volquetes y salidas.
--
-- El encargado trabaja en la cantera, casi siempre sin señal. Anota cada volquete
-- en el celular y la salida llega cuando hay conexión, a veces un día después.
--
-- Reglas:
--   * El encargado no ve precios, montos ni deudas. tiene_acceso_empresa() pasa a
--     significar "acceso de oficina" y lo deja fuera de todo lo que ya existe. Solo
--     recibe lo suyo por datos_cantera(), que no trae montos.
--   * Lo que no calza se marca, no se rechaza: el volquete ya salió. Una salida sin
--     venta, de más o de una venta detenida se guarda y queda para que la oficina la
--     revise. Rechazarla la dejaría atascada en un celular.
--   * El celular genera el id: enviar dos veces la misma salida no la duplica.
--   * Quien la registró la anula el mismo día, con motivo; después, solo un admin.
--   * La entrega de una venta se calcula con sus salidas. Ya no se puede quitar una
--     línea con salidas, bajar de lo entregado ni anular la venta sin resolverlas.
--
-- El piloto es en VDC: esa empresa queda con el módulo activado.
-- Aditiva: la app desplegada sigue funcionando; nadie tiene aún el rol nuevo.
-- Reversible con supabase/rollbacks/20261031020000_salidas_de_cantera.rollback.sql

begin;

-- ── Rol Encargado ──────────────────────────────────────────────────────────

alter table public.usuario_empresa drop constraint usuario_empresa_rol_check;
alter table public.usuario_empresa add constraint usuario_empresa_rol_check
  check (rol in ('admin', 'vendedor', 'encargado'));

-- Desde aquí significa "acceso de oficina". Todas las tablas y funciones que ya la
-- usan quedan cerradas para el encargado sin tener que tocarlas una por una.
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
      and ue.rol <> 'encargado'
      and coalesce(ue.activo, true)
      and coalesce(p.activo, true)
  );
$$;

-- Cualquiera asignado a la empresa, también el encargado.
create function public.tiene_acceso_cantera(p_empresa_id text)
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

revoke all on function public.tiene_acceso_cantera(text) from public, anon;
grant execute on function public.tiene_acceso_cantera(text) to authenticated, service_role;

-- mis_empresas() lee esta tabla con los permisos de quien llama. Las cuentas
-- bancarias siguen siendo de oficina: al encargado le llegan vacías.
drop policy empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (public.tiene_acceso_cantera(id));

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
    if coalesce(v_asignacion->>'rol', '') not in ('admin', 'vendedor', 'encargado') then
      raise exception 'Rol inválido en la empresa %: usa admin, vendedor o encargado.', v_asignacion->>'empresa_id'
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

-- ── Módulos por empresa ────────────────────────────────────────────────────

alter table public.empresas
  add column modulos text[] not null default '{}',
  add column capacidad_volquete_m3 numeric(8,2) not null default 25;

alter table public.empresas
  add constraint empresas_modulos_check check (modulos <@ array['salidas']::text[]),
  add constraint empresas_capacidad_volquete_check check (capacidad_volquete_m3 > 0);

-- El admin de una empresa edita su ficha, pero los módulos son del administrador general.
create function public.proteger_modulos_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.modulos is distinct from old.modulos and auth.uid() is not null and not public.es_superadmin() then
    raise exception 'Solo el administrador general activa módulos.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_modulos_empresa() from public, anon, authenticated;

create trigger trg_proteger_modulos_empresa
  before update on public.empresas
  for each row execute function public.proteger_modulos_empresa();

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table public.vehiculos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       text not null references public.empresas(id) on update cascade on delete cascade,
  placa            text not null check (placa ~ '^[A-Z0-9]{1,12}$'),
  capacidad_m3     numeric(8,2) check (capacidad_m3 > 0),
  -- Vacío: lo agregó el encargado desde la cantera y falta completarlo en oficina.
  propietario      text check (propietario in ('PROPIO', 'TERCERO', 'CLIENTE')),
  chofer           text,
  activo           boolean not null default true,
  ultima_salida_en timestamptz,
  creado_en        timestamptz not null default clock_timestamp(),
  creado_por       uuid references public.profiles(id) on delete set null,
  unique (empresa_id, placa)
);

create table public.salidas (
  -- Lo genera el celular: enviar dos veces la misma salida no la duplica.
  id                  uuid primary key,
  empresa_id          text not null references public.empresas(id) on update cascade,
  venta_id            uuid references public.ventas(id),
  venta_item_id       uuid references public.venta_items(id),
  folio_venta         text,
  cliente             text not null,
  producto_id         uuid references public.productos(id) on delete set null,
  material            text not null,
  unidad              text not null,
  cantidad            numeric(14,4) not null check (cantidad > 0),
  placa               text not null,
  chofer              text,
  guia                text,
  fecha               date not null,
  -- Cuándo salió, según el celular, y cuándo llegó aquí: pueden ser días distintos.
  registrada_en       timestamptz not null,
  recibida_en         timestamptz not null default clock_timestamp(),
  creado_por          uuid references public.profiles(id) on delete set null,
  creado_por_nombre   text,
  estado              text not null default 'ACTIVA' check (estado in ('ACTIVA', 'ANULADA')),
  avisos              text[] not null default '{}'
                      check (avisos <@ array['DETENIDA', 'EXCEDE', 'VENTA_ANULADA', 'LINEA_QUITADA']::text[]),
  revisada_en         timestamptz,
  revisada_por        uuid references public.profiles(id) on delete set null,
  revisada_por_nombre text,
  nota_revision       text,
  anulada_en          timestamptz,
  anulada_por         uuid references public.profiles(id) on delete set null,
  anulada_por_nombre  text,
  motivo_anulacion    text,
  por_revisar         boolean generated always as (
                        estado = 'ACTIVA' and revisada_en is null
                        and (venta_item_id is null or cardinality(avisos) > 0)
                      ) stored
);

create index idx_vehiculos_empresa on public.vehiculos (empresa_id);
create index idx_salidas_empresa_fecha on public.salidas (empresa_id, fecha desc, registrada_en desc);
create index idx_salidas_venta on public.salidas (venta_id);
create index idx_salidas_venta_item on public.salidas (venta_item_id);
create index idx_salidas_producto on public.salidas (producto_id);
create index idx_salidas_por_revisar on public.salidas (empresa_id) where por_revisar;

alter table public.vehiculos enable row level security;
alter table public.salidas   enable row level security;

create policy vehiculos_select on public.vehiculos for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));
create policy salidas_select on public.salidas for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));

revoke all on public.vehiculos, public.salidas from public, anon, authenticated;
grant select on public.vehiculos, public.salidas to authenticated;

-- ── Lo que cambia en las ventas ────────────────────────────────────────────

alter table public.venta_items
  add column entregado numeric(14,4) not null default 0;

alter table public.ventas
  add column salidas_detenidas_en timestamptz,
  add column salidas_detenidas_por uuid references public.profiles(id) on delete set null,
  add column salidas_detenidas_por_nombre text,
  add column motivo_detencion text;

alter table public.venta_cambios drop constraint venta_cambios_tipo_check;
alter table public.venta_cambios add constraint venta_cambios_tipo_check
  check (tipo in ('AJUSTE', 'ANULACION', 'ENTREGA', 'COMPROBANTE', 'PAGO_ANULADO', 'COMPROBANTE_ANULADO',
                  'SALIDAS_DETENIDAS', 'SALIDAS_REANUDADAS', 'SALIDA_ANULADA', 'SALIDA_ENLAZADA', 'SALIDA_MOVIDA'));

-- ── Funciones internas (no se pueden llamar por la API) ─────────────────────

-- "abc-123 " y "ABC123" son el mismo volquete.
create function public.normalizar_placa(p_placa text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Un flete o un alquiler no sale de la cantera. Mismo criterio que esUnidadDeServicio().
create function public.es_unidad_de_servicio(p_unidad text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(btrim(coalesce(p_unidad, ''))) in ('viaje', 'hora', 'día', 'dia', 'mes', 'glb');
$$;

create function public.es_unidad_de_volumen(p_unidad text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(btrim(coalesce(p_unidad, ''))) in ('m3', 'm³');
$$;

create function public.nombre_de_usuario_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(nombre), ''), email) from public.profiles where id = (select auth.uid());
$$;

-- Lo entregado se calcula de nuevo desde las salidas, no se suma: así no se desvía.
-- Una venta solo de servicios conserva lo que se haya marcado a mano.
-- El llamador ya bloqueó la venta.
create function public.recalcular_entrega_venta(p_venta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas    int;
  v_completas int;
  v_alguna    boolean;
begin
  update public.venta_items i
     set entregado = coalesce((select sum(s.cantidad) from public.salidas s
                                where s.venta_item_id = i.id and s.estado = 'ACTIVA'), 0)
   where i.venta_id = p_venta_id;

  -- Si se amplió la venta o se anuló una salida, lo que sobraba ya no sobra.
  update public.salidas s
     set avisos = array_remove(s.avisos, 'EXCEDE')
    from public.venta_items i
   where i.id = s.venta_item_id
     and i.venta_id = p_venta_id
     and 'EXCEDE' = any (s.avisos)
     and i.entregado <= i.cantidad;

  select count(*) filter (where not public.es_unidad_de_servicio(unidad)),
         count(*) filter (where not public.es_unidad_de_servicio(unidad) and entregado >= cantidad),
         coalesce(bool_or(entregado > 0), false)
    into v_lineas, v_completas, v_alguna
    from public.venta_items
   where venta_id = p_venta_id;

  if v_lineas = 0 then
    return;
  end if;

  update public.ventas
     set estado_entrega = case when v_completas = v_lineas then 'ENTREGADA'
                               when v_alguna then 'PARCIAL'
                               else 'PENDIENTE' end
   where id = p_venta_id;
end;
$$;

revoke all on function public.normalizar_placa(text) from public, anon, authenticated;
revoke all on function public.es_unidad_de_servicio(text) from public, anon, authenticated;
revoke all on function public.es_unidad_de_volumen(text) from public, anon, authenticated;
revoke all on function public.nombre_de_usuario_actual() from public, anon, authenticated;
revoke all on function public.recalcular_entrega_venta(uuid) from public, anon, authenticated;

-- ── Lo que usa el celular ──────────────────────────────────────────────────

-- Todo lo que el encargado necesita para trabajar sin señal. Sin montos ni
-- observaciones, y de una venta detenida solo se dice que lo está: el motivo suele
-- hablar de deudas.
create function public.datos_cantera(p_empresa_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para bajar los datos de cantera.' using errcode = '42501';
  end if;
  if not public.tiene_acceso_cantera(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'capacidad_m3', (select capacidad_volquete_m3 from public.empresas where id = p_empresa_id),
    'ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id,
               'folio', v.folio,
               'fecha', v.fecha,
               'cliente', v.cliente_nombre,
               'lugar_entrega', v.lugar_entrega,
               'detenida', v.salidas_detenidas_en is not null,
               'lineas', (select jsonb_agg(jsonb_build_object(
                                   'id', i.id,
                                   'producto_id', i.producto_id,
                                   'material', i.descripcion,
                                   'unidad', i.unidad,
                                   'cantidad', i.cantidad,
                                   'entregado', i.entregado
                                 ) order by i.orden)
                            from public.venta_items i
                           where i.venta_id = v.id and not public.es_unidad_de_servicio(i.unidad))
             ) order by v.fecha desc, v.registrada_en desc)
        from public.ventas v
       where v.empresa_id = p_empresa_id
         and v.estado = 'ACTIVA'
         and v.estado_entrega <> 'ENTREGADA'
         and exists (select 1 from public.venta_items i
                      where i.venta_id = v.id and not public.es_unidad_de_servicio(i.unidad))
    ), '[]'::jsonb),
    'vehiculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'placa', x.placa,
               'capacidad_m3', x.capacidad_m3,
               'chofer', x.chofer,
               'ultima_salida_en', x.ultima_salida_en
             ) order by x.ultima_salida_en desc nulls last, x.placa)
        from public.vehiculos x
       where x.empresa_id = p_empresa_id and x.activo
    ), '[]'::jsonb),
    'materiales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'material', p.descripcion,
               'unidad', p.unidad
             ) order by p.descripcion)
        from public.productos p
       where p.empresa_id = p_empresa_id
         and nullif(btrim(coalesce(p.unidad, '')), '') is not null
         and not public.es_unidad_de_servicio(p.unidad)
    ), '[]'::jsonb),
    'salidas_hoy', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'venta_id', s.venta_id,
               'venta_item_id', s.venta_item_id,
               'folio_venta', s.folio_venta,
               'cliente', s.cliente,
               'material', s.material,
               'unidad', s.unidad,
               'cantidad', s.cantidad,
               'placa', s.placa,
               'chofer', s.chofer,
               'guia', s.guia,
               'fecha', s.fecha,
               'registrada_en', s.registrada_en,
               'estado', s.estado,
               'creado_por', s.creado_por,
               'creado_por_nombre', s.creado_por_nombre,
               'motivo_anulacion', s.motivo_anulacion
             ) order by s.registrada_en desc)
        from public.salidas s
       where s.empresa_id = p_empresa_id and s.fecha = v_hoy
    ), '[]'::jsonb)
  );
end;
$$;

-- Nunca rechaza por una regla del negocio: lo que no calza se guarda y se marca. Solo
-- rechaza lo que no es una salida (sin placa, sin material, cantidad en cero).
create function public.registrar_salida(
  p_id            uuid,
  p_empresa_id    text,
  p_venta_id      uuid,
  p_venta_item_id uuid,
  p_cliente       text,
  p_producto_id   uuid,
  p_material      text,
  p_unidad        text,
  p_cantidad      numeric,
  p_placa         text,
  p_chofer        text default null,
  p_guia          text default null,
  p_registrada_en timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max       constant numeric := 99999999.99;
  v_uid       uuid := auth.uid();
  -- Un celular con la hora adelantada no deja una salida en el futuro.
  v_momento   timestamptz := least(coalesce(p_registrada_en, now()), now());
  v_placa     text := public.normalizar_placa(p_placa);
  v_cantidad  numeric := round(coalesce(p_cantidad, 0), 4);
  v_cliente   text := left(nullif(btrim(coalesce(p_cliente, '')), ''), 255);
  v_material  text := left(nullif(btrim(coalesce(p_material, '')), ''), 500);
  v_unidad    text := left(nullif(btrim(coalesce(p_unidad, '')), ''), 20);
  v_chofer    text := left(nullif(btrim(coalesce(p_chofer, '')), ''), 100);
  v_guia      text := left(nullif(btrim(coalesce(p_guia, '')), ''), 50);
  v_producto  uuid;
  v_venta     public.ventas%rowtype;
  v_item      public.venta_items%rowtype;
  v_venta_id  uuid;
  v_item_id   uuid;
  v_folio     text;
  v_avisos    text[] := '{}';
  v_salida    public.salidas%rowtype;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para registrar salidas.' using errcode = '42501';
  end if;
  if not public.tiene_acceso_cantera(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'La salida llegó sin identificador.' using errcode = '22023';
  end if;

  select * into v_salida from public.salidas where id = p_id;
  if found then
    if v_salida.empresa_id <> p_empresa_id then
      raise exception 'La salida no es de esta empresa.' using errcode = '22023';
    end if;
    return to_jsonb(v_salida);
  end if;

  if v_placa = '' or length(v_placa) > 12 then
    raise exception 'Escribe la placa del volquete.' using errcode = '22023';
  end if;
  if v_material is null then
    raise exception 'Indica qué material salió.' using errcode = '22023';
  end if;
  if v_cantidad <= 0 or v_cantidad > c_max then
    raise exception 'La cantidad debe ser mayor a 0.' using errcode = '22023';
  end if;

  select id into v_producto from public.productos where id = p_producto_id and empresa_id = p_empresa_id;

  if p_venta_id is not null then
    select * into v_venta from public.ventas where id = p_venta_id and empresa_id = p_empresa_id for update;
    if not found then
      v_avisos := array_append(v_avisos, 'LINEA_QUITADA');
    elsif v_venta.estado <> 'ACTIVA' then
      -- La anularon mientras el celular no tenía señal: se conserva a quién era.
      v_folio := v_venta.folio;
      v_avisos := array_append(v_avisos, 'VENTA_ANULADA');
    else
      v_venta_id := v_venta.id;
      v_folio := v_venta.folio;
      v_cliente := v_venta.cliente_nombre;
      select * into v_item from public.venta_items where id = p_venta_item_id and venta_id = v_venta.id;
      if found then
        v_item_id := v_item.id;
        v_material := v_item.descripcion;
        v_unidad := v_item.unidad;
        v_producto := v_item.producto_id;
        if v_item.entregado + v_cantidad > v_item.cantidad then
          v_avisos := array_append(v_avisos, 'EXCEDE');
        end if;
      else
        v_avisos := array_append(v_avisos, 'LINEA_QUITADA');
      end if;
      if v_venta.salidas_detenidas_en is not null and v_momento >= v_venta.salidas_detenidas_en then
        v_avisos := array_append(v_avisos, 'DETENIDA');
      end if;
    end if;
  end if;

  if v_cliente is null then
    raise exception 'Escribe para quién es la salida.' using errcode = '22023';
  end if;
  if v_unidad is null then
    raise exception 'Indica la unidad de la salida.' using errcode = '22023';
  end if;

  insert into public.salidas (
    id, empresa_id, venta_id, venta_item_id, folio_venta, cliente, producto_id, material, unidad, cantidad,
    placa, chofer, guia, fecha, registrada_en, creado_por, creado_por_nombre, avisos
  ) values (
    p_id, p_empresa_id, v_venta_id, v_item_id, v_folio, v_cliente, v_producto, v_material, v_unidad, v_cantidad,
    v_placa, v_chofer, v_guia, (v_momento at time zone 'America/Lima')::date, v_momento,
    v_uid, public.nombre_de_usuario_actual(), v_avisos
  )
  on conflict (id) do nothing
  returning * into v_salida;

  -- Dos envíos a la vez de una salida sin venta: el segundo no hace nada.
  if v_salida.id is null then
    select * into v_salida from public.salidas where id = p_id;
    return to_jsonb(v_salida);
  end if;

  -- Una placa nueva no detiene el viaje: la oficina la completa después.
  insert into public.vehiculos as x (empresa_id, placa, capacidad_m3, chofer, ultima_salida_en, creado_por)
  values (p_empresa_id, v_placa,
          case when public.es_unidad_de_volumen(v_unidad) and v_cantidad <= 999999.99 then v_cantidad end,
          v_chofer, v_momento, v_uid)
  on conflict (empresa_id, placa) do update set
    capacidad_m3 = coalesce(x.capacidad_m3, excluded.capacidad_m3),
    chofer = coalesce(excluded.chofer, x.chofer),
    ultima_salida_en = greatest(x.ultima_salida_en, excluded.ultima_salida_en);

  if v_venta_id is not null then
    perform public.recalcular_entrega_venta(v_venta_id);
  end if;

  return to_jsonb(v_salida);
end;
$$;

-- p_anulada_en es la hora del celular: anulada a tiempo sin señal puede llegar al día siguiente.
create function public.anular_salida(p_salida_id uuid, p_motivo text, p_anulada_en timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salida  public.salidas%rowtype;
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_momento timestamptz := least(coalesce(p_anulada_en, now()), now());
  v_nombre  text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para anular salidas.' using errcode = '42501';
  end if;
  select * into v_salida from public.salidas where id = p_salida_id;
  if not found or not public.tiene_acceso_cantera(v_salida.empresa_id) then
    raise exception 'La salida no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Indica por qué se anula la salida.' using errcode = '22023';
  end if;
  if not public.es_admin_de_empresa(v_salida.empresa_id) then
    if v_salida.creado_por is distinct from auth.uid() then
      raise exception 'Solo quien la registró o un admin puede anular esta salida.' using errcode = '22023';
    end if;
    if (v_momento at time zone 'America/Lima')::date <> v_salida.fecha then
      raise exception 'Solo se anula el mismo día. Después, pídeselo a un admin.' using errcode = '22023';
    end if;
  end if;

  -- Primero la venta: en el mismo orden que registrar_salida().
  if v_salida.venta_id is not null then
    perform 1 from public.ventas where id = v_salida.venta_id for update;
  end if;
  select * into v_salida from public.salidas where id = p_salida_id for update;
  if v_salida.estado = 'ANULADA' then
    return to_jsonb(v_salida);
  end if;

  v_nombre := public.nombre_de_usuario_actual();
  update public.salidas
     set estado = 'ANULADA', anulada_en = v_momento, anulada_por = auth.uid(), anulada_por_nombre = v_nombre, motivo_anulacion = v_motivo
   where id = p_salida_id
  returning * into v_salida;

  if v_salida.venta_id is not null then
    perform public.recalcular_entrega_venta(v_salida.venta_id);
    insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle, motivo)
    values (v_salida.venta_id, v_salida.empresa_id, auth.uid(), v_nombre, 'SALIDA_ANULADA',
            jsonb_build_object('placa', v_salida.placa, 'cantidad', v_salida.cantidad, 'unidad', v_salida.unidad,
                               'material', v_salida.material, 'fecha', v_salida.fecha), v_motivo);
  end if;

  return to_jsonb(v_salida);
end;
$$;

-- ── Lo que usa la oficina ──────────────────────────────────────────────────

-- Liga una salida a una línea de venta, o la pasa de una venta a otra si el
-- encargado eligió la equivocada.
create function public.enlazar_salida(p_salida_id uuid, p_venta_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salida  public.salidas%rowtype;
  v_item    public.venta_items%rowtype;
  v_venta   public.ventas%rowtype;
  v_anterior uuid;
  v_nombre  text;
  v_avisos  text[];
  v_detalle jsonb;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para enlazar salidas.' using errcode = '42501';
  end if;
  select * into v_salida from public.salidas where id = p_salida_id;
  if not found or not public.tiene_acceso_empresa(v_salida.empresa_id) then
    raise exception 'La salida no existe o no tienes acceso.' using errcode = '42501';
  end if;
  select * into v_item from public.venta_items where id = p_venta_item_id and empresa_id = v_salida.empresa_id;
  if not found then
    raise exception 'Esa línea de venta no existe en esta empresa.' using errcode = '22023';
  end if;

  v_anterior := v_salida.venta_id;

  -- Siempre en el mismo orden, para que dos enlaces cruzados no se traben.
  perform 1 from public.ventas where id in (v_anterior, v_item.venta_id) order by id for update;
  select * into v_salida from public.salidas where id = p_salida_id for update;
  select * into v_item from public.venta_items where id = p_venta_item_id;
  select * into v_venta from public.ventas where id = v_item.venta_id;

  if v_salida.estado <> 'ACTIVA' then
    raise exception 'Esa salida está anulada.' using errcode = '22023';
  end if;
  if v_venta.estado <> 'ACTIVA' then
    raise exception 'La venta % está anulada.', v_venta.folio using errcode = '22023';
  end if;
  if v_salida.venta_item_id = v_item.id then
    return to_jsonb(v_salida);
  end if;
  if lower(btrim(v_salida.unidad)) <> lower(btrim(v_item.unidad)) then
    raise exception 'La salida está en % y esa línea en %.', v_salida.unidad, v_item.unidad using errcode = '22023';
  end if;

  v_avisos := array_remove(array_remove(array_remove(v_salida.avisos, 'LINEA_QUITADA'), 'VENTA_ANULADA'), 'EXCEDE');
  if v_item.entregado + v_salida.cantidad > v_item.cantidad then
    v_avisos := array_append(v_avisos, 'EXCEDE');
  end if;

  v_nombre := public.nombre_de_usuario_actual();
  v_detalle := jsonb_build_object('placa', v_salida.placa, 'cantidad', v_salida.cantidad, 'unidad', v_salida.unidad,
                                  'material', v_salida.material, 'fecha', v_salida.fecha, 'cliente', v_salida.cliente);

  update public.salidas
     set venta_id = v_venta.id, venta_item_id = v_item.id, folio_venta = v_venta.folio, cliente = v_venta.cliente_nombre,
         material = v_item.descripcion, unidad = v_item.unidad, producto_id = v_item.producto_id, avisos = v_avisos
   where id = p_salida_id
  returning * into v_salida;

  perform public.recalcular_entrega_venta(v_venta.id);
  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle)
  values (v_venta.id, v_venta.empresa_id, auth.uid(), v_nombre, 'SALIDA_ENLAZADA', v_detalle);

  if v_anterior is not null and v_anterior <> v_venta.id then
    perform public.recalcular_entrega_venta(v_anterior);
    insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle)
    values (v_anterior, v_venta.empresa_id, auth.uid(), v_nombre, 'SALIDA_MOVIDA',
            v_detalle || jsonb_build_object('hacia', v_venta.folio));
  end if;

  return to_jsonb(v_salida);
end;
$$;

-- Da por vista una salida marcada. También cierra una salida que no era una venta,
-- como un uso interno: la nota explica por qué.
create function public.revisar_salida(p_salida_id uuid, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salida public.salidas%rowtype;
  v_nota   text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para revisar salidas.' using errcode = '42501';
  end if;
  select * into v_salida from public.salidas where id = p_salida_id for update;
  if not found or not public.tiene_acceso_empresa(v_salida.empresa_id) then
    raise exception 'La salida no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_salida.estado <> 'ACTIVA' then
    raise exception 'Esa salida está anulada.' using errcode = '22023';
  end if;
  if v_nota is null then
    raise exception 'Anota qué se revisó.' using errcode = '22023';
  end if;

  update public.salidas
     set revisada_en = now(), revisada_por = auth.uid(), revisada_por_nombre = public.nombre_de_usuario_actual(),
         nota_revision = left(v_nota, 500)
   where id = p_salida_id
  returning * into v_salida;

  return to_jsonb(v_salida);
end;
$$;

-- No impide nada en la cantera: el encargado recibe el aviso cuando tenga señal y,
-- si igual sale, queda marcado.
create function public.detener_salidas_venta(p_venta_id uuid, p_detener boolean, p_motivo text default null)
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
    raise exception 'Inicia sesión para actualizar ventas.' using errcode = '42501';
  end if;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or not public.tiene_acceso_empresa(v_venta.empresa_id) then
    raise exception 'La venta no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_venta.estado <> 'ACTIVA' then
    raise exception 'La venta % está anulada.', v_venta.folio;
  end if;
  if coalesce(p_detener, false) and v_motivo is null then
    raise exception 'Indica por qué se detienen las salidas.' using errcode = '22023';
  end if;

  -- Volver a pedir lo mismo no ensucia el historial.
  if coalesce(p_detener, false) = (v_venta.salidas_detenidas_en is not null) then
    return public.venta_json(p_venta_id);
  end if;

  v_nombre := public.nombre_de_usuario_actual();
  if p_detener then
    update public.ventas
       set salidas_detenidas_en = now(), salidas_detenidas_por = auth.uid(),
           salidas_detenidas_por_nombre = v_nombre, motivo_detencion = v_motivo
     where id = p_venta_id;
  else
    update public.ventas
       set salidas_detenidas_en = null, salidas_detenidas_por = null,
           salidas_detenidas_por_nombre = null, motivo_detencion = null
     where id = p_venta_id;
  end if;

  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, motivo)
  values (p_venta_id, v_venta.empresa_id, auth.uid(), v_nombre,
          case when p_detener then 'SALIDAS_DETENIDAS' else 'SALIDAS_REANUDADAS' end, v_motivo);

  return public.venta_json(p_venta_id);
end;
$$;

-- Con p_id actualiza; sin él, agrega.
create function public.guardar_vehiculo(
  p_empresa_id  text,
  p_id          uuid,
  p_placa       text,
  p_capacidad_m3 numeric,
  p_propietario text,
  p_chofer      text default null,
  p_activo      boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placa     text := public.normalizar_placa(p_placa);
  v_capacidad numeric := round(p_capacidad_m3, 2);
  v_chofer    text := left(nullif(btrim(coalesce(p_chofer, '')), ''), 100);
  v_vehiculo  public.vehiculos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para guardar volquetes.' using errcode = '42501';
  end if;
  if not public.tiene_acceso_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.' using errcode = '42501';
  end if;
  if v_placa = '' or length(v_placa) > 12 then
    raise exception 'Escribe la placa del volquete.' using errcode = '22023';
  end if;
  if v_capacidad is not null and (v_capacidad <= 0 or v_capacidad > 999999.99) then
    raise exception 'La capacidad debe ser mayor a 0.' using errcode = '22023';
  end if;
  if p_propietario is not null and p_propietario not in ('PROPIO', 'TERCERO', 'CLIENTE') then
    raise exception 'Indica de quién es el volquete.' using errcode = '22023';
  end if;
  if exists (select 1 from public.vehiculos
              where empresa_id = p_empresa_id and placa = v_placa and id is distinct from p_id) then
    raise exception 'La placa % ya está registrada.', v_placa using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.vehiculos (empresa_id, placa, capacidad_m3, propietario, chofer, activo, creado_por)
    values (p_empresa_id, v_placa, v_capacidad, p_propietario, v_chofer, coalesce(p_activo, true), auth.uid())
    returning * into v_vehiculo;
  else
    update public.vehiculos
       set placa = v_placa, capacidad_m3 = v_capacidad, propietario = p_propietario, chofer = v_chofer, activo = coalesce(p_activo, true)
     where id = p_id and empresa_id = p_empresa_id
    returning * into v_vehiculo;
    if v_vehiculo.id is null then
      raise exception 'Ese volquete no existe en esta empresa.' using errcode = '22023';
    end if;
  end if;

  return to_jsonb(v_vehiculo);
end;
$$;

revoke all on function public.datos_cantera(text) from public, anon;
revoke all on function public.registrar_salida(uuid, text, uuid, uuid, text, uuid, text, text, numeric, text, text, text, timestamptz) from public, anon;
revoke all on function public.anular_salida(uuid, text, timestamptz) from public, anon;
revoke all on function public.enlazar_salida(uuid, uuid) from public, anon;
revoke all on function public.revisar_salida(uuid, text) from public, anon;
revoke all on function public.detener_salidas_venta(uuid, boolean, text) from public, anon;
revoke all on function public.guardar_vehiculo(text, uuid, text, numeric, text, text, boolean) from public, anon;

grant execute on function public.datos_cantera(text) to authenticated, service_role;
grant execute on function public.registrar_salida(uuid, text, uuid, uuid, text, uuid, text, text, numeric, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.anular_salida(uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.enlazar_salida(uuid, uuid) to authenticated, service_role;
grant execute on function public.revisar_salida(uuid, text) to authenticated, service_role;
grant execute on function public.detener_salidas_venta(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.guardar_vehiculo(text, uuid, text, numeric, text, text, boolean) to authenticated, service_role;

-- ── Reglas de ventas que ahora dependen de las salidas ──────────────────────

-- Igual que antes, salvo: no se quita una línea con salidas, no se baja de lo
-- entregado ni se cambia su unidad, y al terminar se recalcula la entrega.
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
  v_linea    public.venta_items%rowtype;
  v_nueva    jsonb;
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

  for v_linea in select i.* from public.venta_items i
                  where i.venta_id = p_venta_id
                    and exists (select 1 from public.salidas s where s.venta_item_id = i.id)
  loop
    select value into v_nueva from jsonb_array_elements(v_items) e where e->>'id' = v_linea.id::text;
    if v_nueva is null then
      raise exception 'No se puede quitar "%": tiene salidas registradas.', v_linea.descripcion using errcode = '22023';
    end if;
    if lower(btrim(v_nueva->>'unidad')) <> lower(btrim(v_linea.unidad)) then
      raise exception 'No se puede cambiar la unidad de "%": tiene salidas registradas.', v_linea.descripcion using errcode = '22023';
    end if;
    if (v_nueva->>'cantidad')::numeric < v_linea.entregado then
      raise exception 'En "%" ya salieron % %: la cantidad no puede ser menor.', v_linea.descripcion, trim_scale(v_linea.entregado), v_linea.unidad
        using errcode = '22023';
    end if;
  end loop;

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

  -- Si ya hay salidas, la entrega depende de las cantidades que acaban de cambiar.
  if exists (select 1 from public.salidas where venta_id = p_venta_id and estado = 'ACTIVA') then
    perform public.recalcular_entrega_venta(p_venta_id);
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();
  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle, motivo)
  values (p_venta_id, v_venta.empresa_id, auth.uid(), v_nombre, 'AJUSTE',
          jsonb_build_object('antes', v_antes, 'despues', public.venta_json(p_venta_id) - 'pagos' - 'venta_cambios'), v_motivo);

  return public.venta_json(p_venta_id);
end;
$$;

-- Con pagos o salidas vigentes no se anula: primero se resuelven, así ni el dinero
-- ni el material desaparecen solos.
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
  if exists (select 1 from public.salidas where venta_id = p_venta_id and estado = 'ACTIVA') then
    raise exception 'La venta % tiene salidas vigentes. Anúlalas o pásalas a otra venta primero.', v_venta.folio;
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

-- A mano solo si la venta no tiene salidas: una deuda antigua o algo entregado en
-- oficina. Con salidas, la entrega la calculan ellas.
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
  if exists (select 1 from public.salidas where venta_id = p_venta_id and estado = 'ACTIVA') then
    raise exception 'La entrega de % se calcula con sus salidas.', v_venta.folio using errcode = '22023';
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

-- ── El piloto ──────────────────────────────────────────────────────────────

update public.empresas set modulos = array['salidas'] where id = 'VDC';

notify pgrst, 'reload schema';

commit;
