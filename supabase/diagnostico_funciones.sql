-- Código de las funciones SECURITY DEFINER, la vista y las columnas de las
-- tablas (solo lectura). Sirve para revisar si admin_crear_usuario y
-- admin_eliminar_usuario verifican que quien llama sea admin.

select json_build_object(
  'funciones', (
    select json_agg(json_build_object('funcion', p.proname, 'definicion', pg_get_functiondef(p.oid)) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  ),
  'vista_flota', pg_get_viewdef('public.v_flota_mantenimiento'::regclass, true),
  'triggers', (
    select json_agg(json_build_object('tabla', event_object_table, 'trigger', trigger_name, 'accion', action_statement))
    from information_schema.triggers where trigger_schema in ('public', 'auth')
  ),
  'columnas', (
    select json_object_agg(table_name, cols) from (
      select table_name, json_agg(column_name || ' ' || data_type order by ordinal_position) cols
      from information_schema.columns where table_schema = 'public' group by table_name
    ) t
  )
) as diagnostico;
