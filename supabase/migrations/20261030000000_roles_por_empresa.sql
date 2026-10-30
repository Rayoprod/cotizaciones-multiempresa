-- Roles por empresa.
--
-- Antes: el rol era global (profiles.rol). Un admin_empresa era admin en
-- TODAS sus empresas y un vendedor, vendedor en todas.
-- Después: cada cuenta tiene un rol en cada empresa asignada
-- (usuario_empresa.rol = 'admin' | 'vendedor'); profiles.rol solo distingue
-- al superadmin ('admin') del resto ('usuario').
--
-- Nadie pierde ni gana permisos: quien era admin_empresa queda como admin en
-- cada una de sus empresas. Lo que distingue a un admin de empresa: la ficha,
-- las cuentas bancarias, los logos y los lugares de entrega. Productos,
-- clientes y cotizaciones los gestionan admins y vendedores por igual.
--
-- Reversible con supabase/rollbacks/20261030000000_roles_por_empresa.rollback.sql

begin;

-- ── Respaldo exacto para el rollback ───────────────────────────────────────
-- Esquema que la API no expone (PostgREST solo publica `public`).

create schema if not exists respaldo;
revoke all on schema respaldo from public, anon, authenticated;

create table respaldo.roles_20261030 as
  select 'profiles'::text as tabla, id, rol from public.profiles
  union all
  select 'usuario_empresa'::text, id, rol from public.usuario_empresa;
revoke all on respaldo.roles_20261030 from public, anon, authenticated;

-- ── Datos y restricciones ──────────────────────────────────────────────────

alter table public.profiles drop constraint profiles_rol_check;
alter table public.usuario_empresa drop constraint usuario_empresa_rol_check;

update public.usuario_empresa ue
   set rol = 'admin'
  from public.profiles p
 where p.id = ue.usuario_id and p.rol = 'admin_empresa';

update public.usuario_empresa set rol = 'vendedor' where rol is distinct from 'admin';

update public.profiles set rol = 'usuario' where rol is distinct from 'admin';

alter table public.profiles
  alter column rol set default 'usuario',
  add constraint profiles_rol_check check (rol in ('admin', 'usuario'));

alter table public.usuario_empresa
  add constraint usuario_empresa_rol_check check (rol in ('admin', 'vendedor'));

-- ── Quién es admin de una empresa ──────────────────────────────────────────
-- Mismo criterio que tiene_acceso_empresa(), más rol = 'admin' en esa empresa.
-- Las políticas de empresas, cuentas_bancarias y Storage ya la usan.

create or replace function public.es_admin_de_empresa(p_empresa_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_superadmin() or exists (
    select 1
    from usuario_empresa ue
    join profiles p on p.id = ue.usuario_id
    where ue.usuario_id = (select auth.uid())
      and ue.empresa_id = p_empresa_id
      and ue.rol = 'admin'
      and coalesce(ue.activo, true)
      and coalesce(p.activo, true)
  );
$$;

-- ── Cuentas nuevas ─────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, rol, email, activo)
  values (new.id, 'usuario', new.email, true)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Las funciones de trigger no necesitan EXECUTE para dispararse; así no se
-- pueden invocar por /rest/v1/rpc (aviso 0029 del revisor de seguridad).
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.fn_sync_horometro_maquinaria() from public, anon, authenticated;

create or replace function public.admin_crear_usuario(p_email text, p_password text, p_rol text default 'usuario')
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
  if p_rol not in ('admin', 'usuario') then
    raise exception 'Tipo de cuenta no válido: % (usa admin o usuario).', p_rol using errcode = '22023';
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

-- ── Asignar empresas con su rol ────────────────────────────────────────────
-- Recibe [{"empresa_id": "VDC", "rol": "admin"}, ...]. Conserva las filas que
-- se mantienen (mismo id), les aplica el rol enviado y quita las que no vienen.

drop function public.asignar_empresas_usuario(uuid, text[]);

create function public.asignar_empresas_usuario(p_usuario_id uuid, p_asignaciones jsonb)
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

revoke all on function public.asignar_empresas_usuario(uuid, jsonb) from public, anon;
grant execute on function public.asignar_empresas_usuario(uuid, jsonb) to authenticated, service_role;

commit;
