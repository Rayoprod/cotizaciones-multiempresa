-- Deshace 20261029010000_aislamiento_por_empresa.sql y vuelve a las
-- políticas abiertas para authenticated (sin las de anon, que siguen cerradas).
-- Solo usar si la app deja de funcionar; vuelve a dejar los datos cruzados
-- entre empresas.

begin;

drop policy if exists clientes_por_empresa on public.clientes;
drop policy if exists productos_por_empresa on public.productos;
drop policy if exists maquinaria_por_empresa on public.maquinaria;
drop policy if exists cotizaciones_por_empresa on public.cotizaciones;
drop policy if exists folios_por_empresa on public.folios_empresas;
drop policy if exists lecturas_por_empresa on public.lecturas_horometro;
drop policy if exists empresas_select on public.empresas;
drop policy if exists empresas_update on public.empresas;
drop policy if exists empresas_insert on public.empresas;
drop policy if exists empresas_delete on public.empresas;
drop policy if exists cuentas_select on public.cuentas_bancarias;
drop policy if exists cuentas_escritura on public.cuentas_bancarias;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_escritura on public.profiles;
drop policy if exists usuario_empresa_select on public.usuario_empresa;
drop policy if exists usuario_empresa_escritura on public.usuario_empresa;

create policy clientes_auth_access on public.clientes for all to authenticated using (true) with check (true);
create policy productos_auth_access on public.productos for all to authenticated using (true) with check (true);
create policy maquinaria_auth_access on public.maquinaria for all to authenticated using (true) with check (true);
create policy cotizaciones_authenticated_access on public.cotizaciones for all to authenticated using (true) with check (true);
create policy folios_empresas_auth_access on public.folios_empresas for all to authenticated using (true) with check (true);
create policy lecturas_horometro_auth_access on public.lecturas_horometro for all to authenticated using (true) with check (true);
create policy empresas_auth_access on public.empresas for all to authenticated using (true) with check (true);
create policy cuentas_bancarias_auth_access on public.cuentas_bancarias for all to authenticated using (true) with check (true);
create policy profiles_auth_access on public.profiles for all to authenticated using (true) with check (true);
create policy usuario_empresa_auth_access on public.usuario_empresa for all to authenticated using (true) with check (true);

alter view public.v_flota_mantenimiento reset (security_invoker);


-- Definiciones originales de las funciones (copiadas de la base antes del cambio)
CREATE OR REPLACE FUNCTION public.admin_crear_usuario(p_email text, p_password text, p_rol text DEFAULT 'vendedor'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth'
AS $function$
    DECLARE
      v_user_id uuid;
      v_encrypted_pw text;
      v_result jsonb;
    BEGIN
      p_email := lower(trim(p_email));

      IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = p_email) THEN
        RAISE EXCEPTION 'El correo electrónico "%" ya se encuentra registrado.', p_email;
      END IF;

      v_user_id := gen_random_uuid();
      v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

      INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
      ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        p_email,
        v_encrypted_pw,
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        '{}'::jsonb,
        'authenticated',
        'authenticated',
        now(),
        now()
      );

      UPDATE public.profiles
      SET rol = p_rol, activo = true, email = p_email
      WHERE id = v_user_id;

      IF NOT FOUND THEN
        INSERT INTO public.profiles (id, email, rol, activo)
        VALUES (v_user_id, p_email, p_rol, true);
      END IF;

      v_result := jsonb_build_object(
        'id', v_user_id,
        'email', p_email,
        'rol', p_rol,
        'success', true
      );

      RETURN v_result;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.admin_eliminar_usuario(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    BEGIN
      DELETE FROM public.usuario_empresa WHERE usuario_id = p_user_id;
      DELETE FROM public.profiles WHERE id = p_user_id;
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN jsonb_build_object('success', true);
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.getnextfolioempresa(empresaid text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
      DECLARE
        nueva_secuencia integer;
        prefijo_empresa text;
        folio_generado text;
      BEGIN
        SELECT prefijo INTO prefijo_empresa
        FROM public.empresas
        WHERE id = empresaid;

        IF prefijo_empresa IS NULL OR prefijo_empresa = '' THEN
          prefijo_empresa := UPPER(LEFT(empresaid, 3));
        END IF;

        INSERT INTO public.folios_empresas (empresa_codigo, secuencia)
        VALUES (empresaid, 1)
        ON CONFLICT (empresa_codigo)
        DO UPDATE SET secuencia = public.folios_empresas.secuencia + 1
        RETURNING secuencia INTO nueva_secuencia;

        folio_generado := prefijo_empresa || '-' || LPAD(nueva_secuencia::text, 8, '0');
        RETURN folio_generado;
      END;
      $function$;

alter function public.handle_new_user() reset search_path;

drop function if exists public.es_admin_de_empresa(text);
drop function if exists public.tiene_acceso_empresa(text);
drop function if exists public.es_superadmin();

commit;
