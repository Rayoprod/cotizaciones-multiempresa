-- Escrituras atómicas para cuentas bancarias y asignaciones, y bucket para
-- logos y firmas.
--
-- Antes:
--   * Guardar una empresa borraba TODAS sus cuentas bancarias y luego las
--     volvía a insertar en otra llamada: si la segunda fallaba, la empresa
--     quedaba sin cuentas (y el PDF sin datos de pago).
--   * Asignar empresas a un usuario hacía lo mismo con usuario_empresa, y
--     además reiniciaba el `rol` de cada asignación a 'vendedor'.
--   * Los logos y firmas se guardaban como texto base64 dentro de
--     empresas (hasta 1.9 MB por fila), que viaja en cada consulta y en
--     sessionStorage.
--
-- Después: dos funciones que hacen todo en una transacción, y un bucket
-- público `empresas` donde cada admin solo puede subir en la carpeta de sus
-- empresas (<empresa_id>/archivo).
--
-- Reversible con supabase/rollbacks/20261029040000_escrituras_atomicas_y_logos.rollback.sql

begin;

-- ── Cuentas bancarias ──────────────────────────────────────────────────────
-- SECURITY INVOKER: las políticas de cuentas_bancarias siguen aplicando; la
-- verificación explícita solo da un mensaje claro.

create function public.guardar_cuentas_bancarias(p_empresa_id text, p_cuentas jsonb)
returns setof public.cuentas_bancarias
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cuenta jsonb;
begin
  if not public.es_admin_de_empresa(p_empresa_id) then
    raise exception 'No puedes editar las cuentas de esta empresa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cuentas) is distinct from 'array' then
    raise exception 'Las cuentas deben enviarse como lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cuentas) > 20 then
    raise exception 'Una empresa admite como máximo 20 cuentas bancarias.' using errcode = '22023';
  end if;

  for v_cuenta in select value from jsonb_array_elements(p_cuentas) loop
    if btrim(coalesce(v_cuenta->>'banco', '')) = '' or btrim(coalesce(v_cuenta->>'numero', '')) = '' then
      raise exception 'Cada cuenta necesita banco y número.' using errcode = '22023';
    end if;
    if coalesce(v_cuenta->>'moneda', 'PEN') not in ('PEN', 'USD', 'EUR') then
      raise exception 'Moneda inválida en la cuenta %.', v_cuenta->>'numero' using errcode = '22023';
    end if;
  end loop;

  delete from public.cuentas_bancarias where empresa_id = p_empresa_id;

  insert into public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, moneda, numero, cci, titular, activa, orden)
  select p_empresa_id,
         btrim(c.value->>'banco'),
         coalesce(nullif(btrim(coalesce(c.value->>'tipo_cuenta', '')), ''), 'Corriente'),
         coalesce(c.value->>'moneda', 'PEN'),
         btrim(c.value->>'numero'),
         nullif(btrim(coalesce(c.value->>'cci', '')), ''),
         nullif(btrim(coalesce(c.value->>'titular', '')), ''),
         case when jsonb_typeof(c.value->'activa') = 'boolean' then (c.value->'activa')::boolean else true end,
         (c.ordinality - 1)::int
    from jsonb_array_elements(p_cuentas) with ordinality as c(value, ordinality);

  return query
  select * from public.cuentas_bancarias where empresa_id = p_empresa_id order by orden;
end;
$$;

revoke all on function public.guardar_cuentas_bancarias(text, jsonb) from public, anon;
grant execute on function public.guardar_cuentas_bancarias(text, jsonb) to authenticated, service_role;

-- ── Empresas de un usuario ─────────────────────────────────────────────────
-- Conserva las asignaciones que se mantienen (con su rol); solo agrega las
-- nuevas y quita las que ya no están.

create function public.asignar_empresas_usuario(p_usuario_id uuid, p_empresa_ids text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador general asigna empresas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_usuario_id) then
    raise exception 'El usuario no existe.' using errcode = '22023';
  end if;

  delete from public.usuario_empresa
   where usuario_id = p_usuario_id
     and empresa_id <> all (coalesce(p_empresa_ids, '{}'));

  insert into public.usuario_empresa (usuario_id, empresa_id, activo)
  select p_usuario_id, e.id, true
    from public.empresas e
   where e.id = any (coalesce(p_empresa_ids, '{}'))
  on conflict (usuario_id, empresa_id) do update set activo = true;
end;
$$;

revoke all on function public.asignar_empresas_usuario(uuid, text[]) from public, anon;
grant execute on function public.asignar_empresas_usuario(uuid, text[]) to authenticated, service_role;

-- ── Bucket de logos y firmas ───────────────────────────────────────────────
-- Público para lectura (el PDF y la app los muestran por URL). Escritura
-- solo para admins de la empresa dueña de la carpeta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('empresas', 'empresas', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']);

create policy empresas_subir_imagenes on storage.objects
  for insert to authenticated
  with check (bucket_id = 'empresas' and public.es_admin_de_empresa((storage.foldername(name))[1]));

create policy empresas_ver_imagenes on storage.objects
  for select to authenticated
  using (bucket_id = 'empresas' and public.es_admin_de_empresa((storage.foldername(name))[1]));

create policy empresas_borrar_imagenes on storage.objects
  for delete to authenticated
  using (bucket_id = 'empresas' and public.es_admin_de_empresa((storage.foldername(name))[1]));

commit;
