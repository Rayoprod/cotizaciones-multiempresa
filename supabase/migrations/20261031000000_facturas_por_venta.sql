-- Varias facturas o boletas por venta, con su monto y su archivo.
--
-- Antes: cada venta guardaba un solo número (ventas.comprobante_tipo y
-- comprobante_numero). Pero es normal facturar cada adelanto y después el saldo.
--
-- Después:
--   * venta_comprobantes: una fila por factura o boleta, con fecha, monto y, si ya
--     lo hay, su archivo. La app no las emite: siguen saliendo del sistema de siempre.
--   * Bucket privado `comprobantes`: cada archivo va en <empresa>/<venta>/ y se ve con
--     un enlace temporal. El archivo no se borra ni se reemplaza.
--   * Cualquiera de la empresa agrega y sube; solo el admin anula, con motivo.
--   * Lo facturado no se limita al total de la venta: lo que no calza se muestra, no
--     se rechaza. En una venta sin IGV la factura puede llevarlo encima.
--
-- Aditiva: la app desplegada sigue funcionando. Las columnas viejas las quita
-- 20261031010000 después de desplegar el frontend nuevo.
-- Reversible con supabase/rollbacks/20261031000000_facturas_por_venta.rollback.sql

begin;

create table public.venta_comprobantes (
  id                 uuid primary key default gen_random_uuid(),
  venta_id           uuid not null references public.ventas(id) on delete cascade,
  empresa_id         text not null references public.empresas(id) on update cascade,
  tipo               text not null check (tipo in ('FACTURA', 'BOLETA')),
  numero             text not null,
  fecha              date not null,
  monto              numeric(10,2) not null check (monto > 0),
  archivo_ruta       text,
  archivo_nombre     text,
  registrado_en      timestamptz not null default clock_timestamp(),
  creado_por         uuid references public.profiles(id) on delete set null,
  creado_por_nombre  text,
  anulado            boolean not null default false,
  anulado_en         timestamptz,
  anulado_por        uuid references public.profiles(id) on delete set null,
  anulado_por_nombre text,
  motivo_anulacion   text
);

create index idx_venta_comprobantes_venta on public.venta_comprobantes (venta_id);
create index idx_venta_comprobantes_empresa on public.venta_comprobantes (empresa_id);
-- En una misma venta el número no se repite, salvo que la anterior se haya anulado.
create unique index uq_venta_comprobantes_numero on public.venta_comprobantes (venta_id, tipo, numero)
  where not anulado;

alter table public.venta_comprobantes enable row level security;

create policy venta_comprobantes_select on public.venta_comprobantes for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));

revoke all on public.venta_comprobantes from public, anon, authenticated;
grant select on public.venta_comprobantes to authenticated;

alter table public.venta_cambios drop constraint venta_cambios_tipo_check;
alter table public.venta_cambios add constraint venta_cambios_tipo_check
  check (tipo in ('AJUSTE', 'ANULACION', 'ENTREGA', 'COMPROBANTE', 'PAGO_ANULADO', 'COMPROBANTE_ANULADO'));

-- Lo que se haya anotado con la versión anterior: era una por el total de la venta.
insert into public.venta_comprobantes (venta_id, empresa_id, tipo, numero, fecha, monto, creado_por, creado_por_nombre)
select v.id, v.empresa_id, coalesce(v.comprobante_tipo, 'FACTURA'), v.comprobante_numero, v.fecha, v.total, v.creado_por, v.vendedor_nombre
  from public.ventas v
 where v.comprobante_numero is not null and v.total > 0;

-- ── Archivos: privados, por empresa ────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

create policy comprobantes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and public.tiene_acceso_empresa((storage.foldername(name))[1]));

create policy comprobantes_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and public.tiene_acceso_empresa((storage.foldername(name))[1]));

-- ── Funciones ──────────────────────────────────────────────────────────────

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
    'venta_comprobantes', coalesce((select jsonb_agg(to_jsonb(c) order by c.fecha, c.registrado_en) from public.venta_comprobantes c where c.venta_id = v.id), '[]'::jsonb),
    'venta_cambios', coalesce((select jsonb_agg(to_jsonb(c) order by c.fecha desc) from public.venta_cambios c where c.venta_id = v.id), '[]'::jsonb)
  )
  from public.ventas v
  where v.id = p_venta_id;
$$;

create function public.agregar_comprobante_venta(
  p_venta_id uuid,
  p_tipo     text,
  p_numero   text,
  p_monto    numeric,
  p_fecha    date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta  public.ventas%rowtype;
  v_numero text := upper(nullif(btrim(coalesce(p_numero, '')), ''));
  v_monto  numeric := round(coalesce(p_monto, 0), 2);
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_fecha  date := coalesce(p_fecha, v_hoy);
  v_nombre text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para agregar facturas.' using errcode = '42501';
  end if;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or not public.tiene_acceso_empresa(v_venta.empresa_id) then
    raise exception 'La venta no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_venta.estado <> 'ACTIVA' then
    raise exception 'La venta % está anulada.', v_venta.folio;
  end if;
  if coalesce(p_tipo, '') not in ('FACTURA', 'BOLETA') then
    raise exception 'Indica si es factura o boleta.' using errcode = '22023';
  end if;
  if v_numero is null then
    raise exception 'Escribe el número de la factura o boleta.' using errcode = '22023';
  end if;
  if length(v_numero) > 30 then
    raise exception 'El número es demasiado largo.' using errcode = '22023';
  end if;
  if v_monto <= 0 or v_monto > 99999999.99 then
    raise exception 'El monto debe ser mayor a 0.' using errcode = '22023';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = '22023';
  end if;
  if exists (select 1 from public.venta_comprobantes
              where venta_id = p_venta_id and tipo = p_tipo and numero = v_numero and not anulado) then
    raise exception 'El número % ya está en esta venta.', v_numero using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();

  insert into public.venta_comprobantes (venta_id, empresa_id, tipo, numero, fecha, monto, creado_por, creado_por_nombre)
  values (p_venta_id, v_venta.empresa_id, p_tipo, v_numero, v_fecha, v_monto, auth.uid(), v_nombre);

  return public.venta_json(p_venta_id);
end;
$$;

-- El archivo se sube primero al bucket; esto lo liga a la factura. Si ya tiene uno
-- no se reemplaza: si es el equivocado, un admin la anula y se agrega de nuevo.
create function public.adjuntar_archivo_comprobante(p_comprobante_id uuid, p_ruta text, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comprobante public.venta_comprobantes%rowtype;
  v_ruta        text := coalesce(p_ruta, '');
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para subir archivos.' using errcode = '42501';
  end if;
  select * into v_comprobante from public.venta_comprobantes where id = p_comprobante_id for update;
  if not found or not public.tiene_acceso_empresa(v_comprobante.empresa_id) then
    raise exception 'La factura no existe o no tienes acceso.' using errcode = '42501';
  end if;
  if v_comprobante.anulado then
    raise exception 'El comprobante % está anulado.', v_comprobante.numero;
  end if;
  if v_comprobante.archivo_ruta is not null then
    raise exception 'El comprobante % ya tiene archivo. Si es el equivocado, un admin puede anularlo y agregarlo de nuevo.', v_comprobante.numero;
  end if;
  -- Solo un archivo que de verdad se subió a la carpeta de esta venta.
  if not starts_with(v_ruta, v_comprobante.empresa_id || '/' || v_comprobante.venta_id || '/')
     or not exists (select 1 from storage.objects where bucket_id = 'comprobantes' and name = v_ruta) then
    raise exception 'No se encontró el archivo subido. Inténtalo de nuevo.' using errcode = '22023';
  end if;

  update public.venta_comprobantes
     set archivo_ruta = v_ruta, archivo_nombre = left(nullif(btrim(coalesce(p_nombre, '')), ''), 255)
   where id = p_comprobante_id;

  return public.venta_json(v_comprobante.venta_id);
end;
$$;

-- Deja de contar como facturado; la fila y su archivo se quedan. La nota de crédito,
-- si corresponde, sale del sistema donde se emitió.
create function public.anular_comprobante_venta(p_comprobante_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comprobante public.venta_comprobantes%rowtype;
  v_motivo      text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nombre      text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para anular facturas.' using errcode = '42501';
  end if;
  select * into v_comprobante from public.venta_comprobantes where id = p_comprobante_id for update;
  if not found or not public.es_admin_de_empresa(v_comprobante.empresa_id) then
    raise exception 'Solo un admin de la empresa puede anular facturas.' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Indica por qué se anula.' using errcode = '22023';
  end if;
  if v_comprobante.anulado then
    raise exception 'El comprobante % ya está anulado.', v_comprobante.numero;
  end if;

  select coalesce(nullif(btrim(nombre), ''), email) into v_nombre from public.profiles where id = auth.uid();

  update public.venta_comprobantes
     set anulado = true, anulado_en = now(), anulado_por = auth.uid(), anulado_por_nombre = v_nombre, motivo_anulacion = v_motivo
   where id = p_comprobante_id;

  insert into public.venta_cambios (venta_id, empresa_id, usuario, usuario_nombre, tipo, detalle, motivo)
  values (v_comprobante.venta_id, v_comprobante.empresa_id, auth.uid(), v_nombre, 'COMPROBANTE_ANULADO',
          jsonb_build_object('tipo', v_comprobante.tipo, 'numero', v_comprobante.numero, 'monto', v_comprobante.monto), v_motivo);

  return public.venta_json(v_comprobante.venta_id);
end;
$$;

revoke all on function public.agregar_comprobante_venta(uuid, text, text, numeric, date) from public, anon;
revoke all on function public.adjuntar_archivo_comprobante(uuid, text, text) from public, anon;
revoke all on function public.anular_comprobante_venta(uuid, text) from public, anon;

grant execute on function public.agregar_comprobante_venta(uuid, text, text, numeric, date) to authenticated, service_role;
grant execute on function public.adjuntar_archivo_comprobante(uuid, text, text) to authenticated, service_role;
grant execute on function public.anular_comprobante_venta(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
