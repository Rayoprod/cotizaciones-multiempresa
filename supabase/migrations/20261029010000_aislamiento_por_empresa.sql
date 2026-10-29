-- Aislamiento entre empresas para usuarios autenticados.
--
-- Antes: todas las políticas para `authenticated` eran `using (true)`, así
-- que cualquier usuario con sesión podía leer y modificar datos de TODAS las
-- empresas, cambiarse su propio rol a 'admin' (profiles) o asignarse a
-- cualquier empresa (usuario_empresa). Además TRUNCATE no respeta RLS.
--
-- Después:
--   * Superadmin (profiles.rol = 'admin', activo): ve y gestiona todo.
--   * Resto: solo empresas asignadas y activas en usuario_empresa.
--   * admin_empresa: además puede editar la ficha y cuentas de SUS empresas.
--   * profiles / usuario_empresa: cada uno ve lo suyo; solo superadmin escribe.
--   * Usuario con profiles.activo = false: no ve nada.
--
-- Mantiene el modelo de rol global actual; el rol por empresa es un rediseño
-- aparte. Reversible con supabase/rollbacks/20261029010000_aislamiento_por_empresa.rollback.sql

begin;

-- ── Funciones auxiliares ───────────────────────────────────────────────────
-- SECURITY DEFINER para que las políticas puedan consultar profiles y
-- usuario_empresa sin recursión de RLS.

create or replace function public.es_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = (select auth.uid()) and rol = 'admin' and coalesce(activo, true)
  );
$$;

create or replace function public.tiene_acceso_empresa(p_empresa_id text)
returns boolean
language sql stable security definer set search_path = public
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

create or replace function public.es_admin_de_empresa(p_empresa_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_superadmin() or (
    public.tiene_acceso_empresa(p_empresa_id)
    and exists (select 1 from profiles where id = (select auth.uid()) and rol = 'admin_empresa')
  );
$$;

revoke execute on function public.es_superadmin(), public.tiene_acceso_empresa(text), public.es_admin_de_empresa(text) from public, anon;
grant execute on function public.es_superadmin(), public.tiene_acceso_empresa(text), public.es_admin_de_empresa(text) to authenticated, service_role;

-- ── Quitar políticas abiertas ──────────────────────────────────────────────
-- Las permisivas se combinan con OR: basta una `true` para anular el resto.
-- "vendedor no ve ocultas" (rol public) dejaba ver las cotizaciones no
-- ocultas de cualquier empresa, por eso también se elimina.

drop policy if exists clientes_auth_access on public.clientes;
drop policy if exists cotizaciones_anon_select on public.cotizaciones;
drop policy if exists cotizaciones_authenticated_access on public.cotizaciones;
drop policy if exists "vendedor no ve ocultas" on public.cotizaciones;
drop policy if exists cuentas_bancarias_anon_select on public.cuentas_bancarias;
drop policy if exists cuentas_bancarias_auth_access on public.cuentas_bancarias;
drop policy if exists empresas_anon_select on public.empresas;
drop policy if exists empresas_auth_access on public.empresas;
drop policy if exists folios_empresas_auth_access on public.folios_empresas;
drop policy if exists lecturas_horometro_auth_access on public.lecturas_horometro;
drop policy if exists maquinaria_auth_access on public.maquinaria;
drop policy if exists productos_auth_access on public.productos;
drop policy if exists profiles_auth_access on public.profiles;
drop policy if exists usuario_empresa_auth_access on public.usuario_empresa;

-- ── Datos operativos: acceso por empresa asignada ──────────────────────────

create policy clientes_por_empresa on public.clientes for all to authenticated
  using (public.tiene_acceso_empresa(empresa_id))
  with check (public.tiene_acceso_empresa(empresa_id));

create policy productos_por_empresa on public.productos for all to authenticated
  using (public.tiene_acceso_empresa(empresa_id))
  with check (public.tiene_acceso_empresa(empresa_id));

create policy maquinaria_por_empresa on public.maquinaria for all to authenticated
  using (public.tiene_acceso_empresa(empresa_id))
  with check (public.tiene_acceso_empresa(empresa_id));

create policy cotizaciones_por_empresa on public.cotizaciones for all to authenticated
  using (public.tiene_acceso_empresa(empresa_id))
  with check (public.tiene_acceso_empresa(empresa_id));

create policy folios_por_empresa on public.folios_empresas for all to authenticated
  using (public.tiene_acceso_empresa(empresa_codigo))
  with check (public.tiene_acceso_empresa(empresa_codigo));

create policy lecturas_por_empresa on public.lecturas_horometro for all to authenticated
  using (exists (
    select 1 from public.maquinaria m
    where m.id = maquina_id and public.tiene_acceso_empresa(m.empresa_id)
  ))
  with check (exists (
    select 1 from public.maquinaria m
    where m.id = maquina_id and public.tiene_acceso_empresa(m.empresa_id)
  ));

-- ── Empresas y cuentas: leer si estás asignado; editar si eres su admin ────

create policy empresas_select on public.empresas for select to authenticated
  using (public.tiene_acceso_empresa(id));
create policy empresas_update on public.empresas for update to authenticated
  using (public.es_admin_de_empresa(id))
  with check (public.es_admin_de_empresa(id));
create policy empresas_insert on public.empresas for insert to authenticated
  with check (public.es_superadmin());
create policy empresas_delete on public.empresas for delete to authenticated
  using (public.es_superadmin());

create policy cuentas_select on public.cuentas_bancarias for select to authenticated
  using (public.tiene_acceso_empresa(empresa_id));
create policy cuentas_escritura on public.cuentas_bancarias for all to authenticated
  using (public.es_admin_de_empresa(empresa_id))
  with check (public.es_admin_de_empresa(empresa_id));

-- ── Perfiles y asignaciones: cada uno ve lo suyo, solo superadmin escribe ──

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.es_superadmin());
create policy profiles_escritura on public.profiles for all to authenticated
  using (public.es_superadmin())
  with check (public.es_superadmin());

create policy usuario_empresa_select on public.usuario_empresa for select to authenticated
  using (usuario_id = (select auth.uid()) or public.es_superadmin());
create policy usuario_empresa_escritura on public.usuario_empresa for all to authenticated
  using (public.es_superadmin())
  with check (public.es_superadmin());

-- ── Vista: que respete el RLS de quien consulta ────────────────────────────
alter view public.v_flota_mantenimiento set (security_invoker = true);

-- ── Funciones SECURITY DEFINER: verificar quién llama ──────────────────────
-- Corren como postgres y saltan RLS, así que sin esta verificación cualquier
-- usuario con sesión podía crear un admin, borrar a cualquier usuario o
-- consumir folios de otra empresa. El cuerpo es el mismo de antes más el chequeo.

create or replace function public.admin_crear_usuario(p_email text, p_password text, p_rol text default 'vendedor')
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth
as $function$
declare
  v_user_id uuid;
  v_encrypted_pw text;
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador general puede crear usuarios.' using errcode = '42501';
  end if;
  if p_rol not in ('admin', 'admin_empresa', 'vendedor') then
    raise exception 'Rol no válido: %', p_rol;
  end if;

  p_email := lower(trim(p_email));

  if exists (select 1 from auth.users where lower(email) = p_email) then
    raise exception 'El correo electrónico "%" ya se encuentra registrado.', p_email;
  end if;

  v_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', p_email, v_encrypted_pw, now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb, 'authenticated', 'authenticated', now(), now()
  );

  update public.profiles set rol = p_rol, activo = true, email = p_email where id = v_user_id;
  if not found then
    insert into public.profiles (id, email, rol, activo) values (v_user_id, p_email, p_rol, true);
  end if;

  return jsonb_build_object('id', v_user_id, 'email', p_email, 'rol', p_rol, 'success', true);
end;
$function$;

create or replace function public.admin_eliminar_usuario(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $function$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador general puede eliminar usuarios.' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'No puedes eliminar tu propio usuario.';
  end if;

  delete from public.usuario_empresa where usuario_id = p_user_id;
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('success', true);
end;
$function$;

create or replace function public.getnextfolioempresa(empresaid text)
returns text
language plpgsql security definer set search_path = public
as $function$
declare
  nueva_secuencia integer;
  prefijo_empresa text;
begin
  if not public.tiene_acceso_empresa(empresaid) then
    raise exception 'Sin acceso a la empresa %', empresaid using errcode = '42501';
  end if;

  select prefijo into prefijo_empresa from public.empresas where id = empresaid;
  if prefijo_empresa is null or prefijo_empresa = '' then
    prefijo_empresa := upper(left(empresaid, 3));
  end if;

  insert into public.folios_empresas (empresa_codigo, secuencia)
  values (empresaid, 1)
  on conflict (empresa_codigo)
  do update set secuencia = public.folios_empresas.secuencia + 1
  returning secuencia into nueva_secuencia;

  return prefijo_empresa || '-' || lpad(nueva_secuencia::text, 8, '0');
end;
$function$;

-- Sin search_path fijo, una función SECURITY DEFINER puede ser engañada.
alter function public.handle_new_user() set search_path = public;

-- ── TRUNCATE ignora RLS: nadie desde la app lo necesita ────────────────────
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

commit;

-- Verificación: lista las políticas nuevas (ninguna debe tener using = 'true').
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
