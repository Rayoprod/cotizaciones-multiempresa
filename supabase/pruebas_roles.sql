-- Pruebas de roles por empresa. Una misma cuenta es admin en la empresa A y
-- vendedora en la B; se comprueba qué puede hacer en cada una. Simula
-- usuarios reales sin iniciar sesión; todo se deshace al final.
--
-- Requiere aplicadas 20261030000000 y 20261030030000.
-- Uso: supabase db query --linked -f supabase/pruebas_roles.sql

begin;

do $$
declare
  r          jsonb := '[]'::jsonb;
  v_super    uuid;
  v_user     uuid;
  v_emp_a    text;
  v_emp_b    text;
  v_emp_c    text;
  v_id_a     uuid;
  v_nuevo    uuid := gen_random_uuid();
  v_n        int;
  v_cuentas  jsonb;
  c          public.cotizaciones;
begin
  -- ── Contexto (como postgres) ─────────────────────────────────────────────
  select id into v_super from public.profiles where rol = 'admin' and activo limit 1;
  select p.id into v_user
    from public.profiles p
   where p.rol = 'usuario' and p.activo
     and (select count(*) from public.usuario_empresa u where u.usuario_id = p.id and u.activo) >= 2
   order by p.id limit 1;
  if v_super is null or v_user is null then
    raise exception 'Faltan usuarios de prueba (superadmin y una cuenta con 2 empresas).';
  end if;
  select empresa_id into v_emp_a from public.usuario_empresa where usuario_id = v_user and activo order by empresa_id limit 1;
  select empresa_id into v_emp_b from public.usuario_empresa where usuario_id = v_user and activo and empresa_id <> v_emp_a order by empresa_id limit 1;
  select id into v_emp_c from public.empresas e
   where not exists (select 1 from public.usuario_empresa ue where ue.usuario_id = v_user and ue.empresa_id = e.id)
   order by id limit 1;
  update public.usuario_empresa set rol = 'admin' where usuario_id = v_user and empresa_id = v_emp_a returning id into v_id_a;
  update public.usuario_empresa set rol = 'vendedor' where usuario_id = v_user and empresa_id = v_emp_b;

  -- ── Migración de datos ───────────────────────────────────────────────────
  select count(*) into v_n from public.profiles where rol not in ('admin', 'usuario');
  r := r || jsonb_build_object('prueba', 'perfiles solo con admin o usuario', 'ok', v_n = 0, 'detalle', v_n || ' con otro rol');
  select count(*) into v_n
    from public.usuario_empresa ue
    join respaldo.roles_20261030 rp on rp.tabla = 'profiles' and rp.id = ue.usuario_id
    join respaldo.roles_20261030 ru on ru.tabla = 'usuario_empresa' and ru.id = ue.id
   where rp.rol = 'admin_empresa' and ue.rol <> 'admin' and ue.usuario_id <> v_user;
  r := r || jsonb_build_object('prueba', 'quien era admin_empresa quedó admin en todas sus empresas', 'ok', v_n = 0, 'detalle', v_n || ' sin migrar');
  select count(*) into v_n
    from public.usuario_empresa ue
    join respaldo.roles_20261030 rp on rp.tabla = 'profiles' and rp.id = ue.usuario_id
   where rp.rol = 'vendedor' and ue.rol <> 'vendedor' and ue.usuario_id <> v_user;
  r := r || jsonb_build_object('prueba', 'quien era vendedor sigue vendedor', 'ok', v_n = 0, 'detalle', v_n || ' cambiados');

  begin
    update public.profiles set rol = 'vendedor' where id = v_user;
    r := r || jsonb_build_object('prueba', 'profiles ya no acepta roles viejos', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'profiles ya no acepta roles viejos', 'ok', sqlstate = '23514', 'detalle', sqlerrm);
  end;

  insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at)
  values (v_nuevo, '00000000-0000-0000-0000-000000000000', 'prueba-roles@ejemplo.invalid', 'authenticated', 'authenticated', now(), now());
  select count(*) into v_n from public.profiles where id = v_nuevo and rol = 'usuario' and activo;
  r := r || jsonb_build_object('prueba', 'una cuenta nueva nace como usuario', 'ok', v_n = 1, 'detalle', '');

  -- ── Como la cuenta: admin en A, vendedora en B, sin acceso a C ───────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select coalesce(jsonb_object_agg(e->>'id', e->>'mi_rol'), '{}') into v_cuentas from jsonb_array_elements(public.mis_empresas()) e;
  r := r || jsonb_build_object('prueba', 'mis_empresas: sus empresas con el rol de cada una y ninguna ajena',
         'ok', v_cuentas->>v_emp_a = 'admin' and v_cuentas->>v_emp_b = 'vendedor' and (v_emp_c is null or not v_cuentas ? v_emp_c),
         'detalle', v_cuentas::text);
  select count(*) into v_n from jsonb_array_elements(public.mis_empresas()) e where jsonb_typeof(e->'cuentas_bancarias') = 'array';
  r := r || jsonb_build_object('prueba', 'mis_empresas trae las cuentas bancarias de cada empresa', 'ok', v_n = jsonb_array_length(public.mis_empresas()), 'detalle', v_n || ' empresas');

  r := r || jsonb_build_object('prueba', 'es admin solo donde tiene rol admin',
         'ok', public.es_admin_de_empresa(v_emp_a) and not public.es_admin_de_empresa(v_emp_b) and not public.es_admin_de_empresa(v_emp_c),
         'detalle', v_emp_a || ' sí, ' || v_emp_b || ' no, ' || coalesce(v_emp_c, '-') || ' no');

  update public.empresas set telefonos = telefonos where id = v_emp_a;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('prueba', 'admin edita la ficha de su empresa', 'ok', v_n = 1, 'detalle', v_emp_a);
  update public.empresas set telefonos = telefonos where id = v_emp_b;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('prueba', 'vendedor no edita la ficha', 'ok', v_n = 0, 'detalle', v_emp_b);

  select coalesce(jsonb_agg(to_jsonb(cb) order by cb.orden), '[]') into v_cuentas from public.cuentas_bancarias cb where empresa_id = v_emp_a;
  begin
    perform public.guardar_cuentas_bancarias(v_emp_a, v_cuentas);
    r := r || jsonb_build_object('prueba', 'admin guarda las cuentas de su empresa', 'ok', true, 'detalle', jsonb_array_length(v_cuentas) || ' cuentas');
  exception when others then
    r := r || jsonb_build_object('prueba', 'admin guarda las cuentas de su empresa', 'ok', false, 'detalle', sqlerrm);
  end;
  begin
    perform public.guardar_cuentas_bancarias(v_emp_b, '[]');
    r := r || jsonb_build_object('prueba', 'vendedor no toca las cuentas', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'vendedor no toca las cuentas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('empresas', v_emp_b || '/logo-prueba.png');
    r := r || jsonb_build_object('prueba', 'vendedor no sube logos', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'vendedor no sube logos', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  -- Como vendedora en B: cotiza, clientes y catálogo sí.
  c := public.crear_cotizacion(v_emp_b, '{"nombre":"CLIENTE DE PRUEBA SAC","documento":"20999999991"}',
                               '[{"descripcion":"Ítem de prueba","cantidad":1,"precio_unitario":10}]');
  r := r || jsonb_build_object('prueba', 'vendedor cotiza', 'ok', c.folio is not null and c.total = 11.80, 'detalle', c.folio);
  begin
    insert into public.productos (codigo_sku, descripcion, unidad, precio_unitario_base, empresa_id)
    values ('PRUEBA-ROL-1', 'Producto de prueba', 'und', 10, v_emp_b);
    update public.productos set precio_unitario_base = 12 where codigo_sku = 'PRUEBA-ROL-1' and empresa_id = v_emp_b;
    get diagnostics v_n = row_count;
    r := r || jsonb_build_object('prueba', 'vendedor crea productos y cambia precios', 'ok', v_n = 1, 'detalle', v_emp_b);
  exception when others then
    r := r || jsonb_build_object('prueba', 'vendedor crea productos y cambia precios', 'ok', false, 'detalle', sqlstate || ' ' || sqlerrm);
  end;
  if v_emp_c is not null then
    begin
      insert into public.productos (codigo_sku, descripcion, unidad, precio_unitario_base, empresa_id)
      values ('PRUEBA-ROL-2', 'Producto ajeno', 'und', 10, v_emp_c);
      r := r || jsonb_build_object('prueba', 'nadie toca el catálogo de una empresa ajena', 'ok', false, 'detalle', 'se pudo');
    exception when others then
      r := r || jsonb_build_object('prueba', 'nadie toca el catálogo de una empresa ajena', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
    end;
  end if;

  -- ── Superadmin reasigna roles ────────────────────────────────────────────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('prueba', 'superadmin es admin en todas', 'ok', public.es_admin_de_empresa(v_emp_b), 'detalle', '');
  select count(*) into v_n from jsonb_array_elements(public.mis_empresas(true)) e where e->>'mi_rol' = 'admin';
  r := r || jsonb_build_object('prueba', 'mis_empresas(true): el superadmin ve todas como admin',
         'ok', v_n = (select count(*) from public.empresas), 'detalle', v_n || ' empresas');
  perform public.asignar_empresas_usuario(v_user, jsonb_build_array(
    jsonb_build_object('empresa_id', v_emp_a, 'rol', 'vendedor'),
    jsonb_build_object('empresa_id', v_emp_b, 'rol', 'admin')
  ));
  select count(*) into v_n from public.usuario_empresa where id = v_id_a and rol = 'vendedor';
  r := r || jsonb_build_object('prueba', 'cambiar el rol conserva la asignación', 'ok', v_n = 1, 'detalle', v_emp_a || ' → vendedor');

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('prueba', 'el permiso sigue al rol nuevo de inmediato',
         'ok', not public.es_admin_de_empresa(v_emp_a) and public.es_admin_de_empresa(v_emp_b), 'detalle', '');

  reset role;
  perform set_config('pruebas.resultado', r::text, true);
end;
$$;

select json_build_object(
  'total',   jsonb_array_length(current_setting('pruebas.resultado')::jsonb),
  'fallidas', (select count(*) from jsonb_array_elements(current_setting('pruebas.resultado')::jsonb) e where not (e->>'ok')::boolean),
  'detalle', current_setting('pruebas.resultado')::jsonb
) as resultado;

rollback;
