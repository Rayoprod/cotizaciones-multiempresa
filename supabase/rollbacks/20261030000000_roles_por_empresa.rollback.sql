-- Deshace 20261030000000_roles_por_empresa.sql.
-- Los roles vuelven exactamente a como estaban (respaldo.roles_20261030).
-- Las cuentas creadas después quedan como 'vendedor' y las asignaciones
-- nuevas conservan su rol (admin/vendedor ya eran válidos antes).
-- El frontend que usa roles por empresa deja de funcionar bien: revertir
-- también el despliegue.

begin;

alter table public.profiles drop constraint profiles_rol_check;
alter table public.usuario_empresa drop constraint usuario_empresa_rol_check;

update public.profiles p
   set rol = r.rol
  from respaldo.roles_20261030 r
 where r.tabla = 'profiles' and r.id = p.id;

update public.usuario_empresa ue
   set rol = r.rol
  from respaldo.roles_20261030 r
 where r.tabla = 'usuario_empresa' and r.id = ue.id;

update public.profiles set rol = 'vendedor' where rol = 'usuario';

alter table public.profiles
  alter column rol set default 'vendedor',
  add constraint profiles_rol_check
    check (rol = any (array['admin'::text, 'admin_empresa'::text, 'vendedor'::text, 'solo_lectura'::text]));

alter table public.usuario_empresa
  add constraint usuario_empresa_rol_check
    check (rol = any (array['admin'::text, 'vendedor'::text, 'solo_lectura'::text]));

create or replace function public.es_admin_de_empresa(p_empresa_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_superadmin() or (
    public.tiene_acceso_empresa(p_empresa_id)
    and exists (select 1 from profiles where id = (select auth.uid()) and rol = 'admin_empresa')
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, rol, email, activo)
  values (new.id, 'vendedor', new.email, true)
  on conflict (id) do nothing;
  return new;
end;
$$;

grant execute on function public.handle_new_user() to authenticated;
do $$
begin
  if to_regprocedure('public.fn_sync_horometro_maquinaria()') is not null then
    grant execute on function public.fn_sync_horometro_maquinaria() to authenticated;
  end if;
end;
$$;

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

drop function if exists public.asignar_empresas_usuario(uuid, jsonb);

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

drop table respaldo.roles_20261030;

commit;
