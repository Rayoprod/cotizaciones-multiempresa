-- Diagnóstico de seguridad (solo lectura, no modifica nada).
-- Ejecutar en Supabase → SQL Editor y copiar el resultado (una sola tabla JSON).
-- Sirve para revisar el aislamiento entre empresas de usuarios autenticados.

select json_build_object(
  -- ¿Qué tablas tienen RLS activado?
  'rls', (
    select json_agg(json_build_object('tabla', c.relname, 'rls', c.relrowsecurity, 'forzado', c.relforcerowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  -- Todas las políticas, con a quién aplican y su condición
  'politicas', (
    select json_agg(json_build_object(
      'tabla', tablename, 'politica', policyname, 'comando', cmd,
      'permisiva', permissive, 'roles', roles, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies where schemaname = 'public'
  ),
  -- Vistas (ignoran RLS si no son security_invoker)
  'vistas', (
    select json_agg(json_build_object('vista', c.relname, 'opciones', c.reloptions))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  ),
  -- Funciones SECURITY DEFINER (corren con permisos del dueño) y quién puede ejecutarlas
  'funciones_definer', (
    select json_agg(json_build_object(
      'funcion', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
      'acl', p.proacl, 'search_path', p.proconfig
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  ),
  -- Permisos de tabla que siguen teniendo anon/authenticated
  'grants', (
    select json_agg(json_build_object('rol', grantee, 'tabla', table_name, 'privilegio', privilege_type) order by grantee, table_name)
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
  )
) as diagnostico;
