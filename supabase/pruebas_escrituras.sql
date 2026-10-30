-- Pruebas de guardar_cuentas_bancarias(), asignar_empresas_usuario() y de
-- las políticas del bucket `empresas`. Simula usuarios reales sin iniciar
-- sesión; todo se deshace al final.
--
-- Requiere aplicada 20261029040000.
-- Uso: supabase db query --linked -f supabase/pruebas_escrituras.sql

begin;

do $$
declare
  r          jsonb := '[]'::jsonb;
  v_super    uuid;
  v_admin    uuid;
  v_vend     uuid;
  v_emp      text;
  v_ajena    text;
  v_otra     text;
  v_n        int;
  v_id_antes uuid;
  v_rol      text;
begin
  -- ── Contexto (como postgres) ─────────────────────────────────────────────
  select id into v_super from public.profiles where rol = 'admin' and activo limit 1;
  select p.id, ue.empresa_id into v_admin, v_emp
    from public.profiles p join public.usuario_empresa ue on ue.usuario_id = p.id and ue.activo
   where p.rol = 'admin_empresa' and p.activo
   order by p.id, ue.empresa_id limit 1;
  select id into v_ajena from public.empresas e
   where not exists (select 1 from public.usuario_empresa ue where ue.usuario_id = v_admin and ue.empresa_id = e.id)
   order by id limit 1;
  select p.id into v_vend
    from public.profiles p join public.usuario_empresa ue on ue.usuario_id = p.id and ue.activo and ue.empresa_id = v_emp
   where p.rol = 'vendedor' and p.activo limit 1;
  if v_super is null or v_admin is null or v_ajena is null then
    raise exception 'Faltan usuarios de prueba (superadmin, admin_empresa con una empresa ajena).';
  end if;

  -- ── Cuentas bancarias como admin_empresa ─────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.guardar_cuentas_bancarias(v_emp,
    '[{"banco":" BCP ","numero":"191-1234567-0-01","cci":"","tipo_cuenta":"Corriente"},
      {"banco":"Banco de la Nación","numero":"00-000-123456","tipo_cuenta":"Detracciones"}]');
  select count(*) into v_n from public.cuentas_bancarias
   where empresa_id = v_emp and ((banco = 'BCP' and orden = 0 and cci is null) or (orden = 1 and tipo_cuenta = 'Detracciones'));
  r := r || jsonb_build_object('prueba', 'reemplaza las cuentas en orden y limpia espacios', 'ok', v_n = 2, 'detalle', v_n || ' de 2');

  begin
    perform public.guardar_cuentas_bancarias(v_emp, '[{"banco":"BBVA","numero":""}]');
    r := r || jsonb_build_object('prueba', 'rechaza cuenta sin número', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza cuenta sin número', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  select count(*) into v_n from public.cuentas_bancarias where empresa_id = v_emp;
  r := r || jsonb_build_object('prueba', 'si falla, las cuentas anteriores siguen intactas', 'ok', v_n = 2, 'detalle', v_n || ' cuentas');

  begin
    perform public.guardar_cuentas_bancarias(v_ajena, '[]');
    r := r || jsonb_build_object('prueba', 'no edita cuentas de una empresa ajena', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no edita cuentas de una empresa ajena', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  begin
    perform public.asignar_empresas_usuario(v_admin, array[v_ajena]);
    r := r || jsonb_build_object('prueba', 'admin_empresa no puede asignarse empresas', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'admin_empresa no puede asignarse empresas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  -- Storage: solo en la carpeta de sus empresas
  begin
    insert into storage.objects (bucket_id, name) values ('empresas', v_emp || '/logo-prueba.png');
    r := r || jsonb_build_object('prueba', 'sube imágenes en la carpeta de su empresa', 'ok', true, 'detalle', v_emp);
  exception when others then
    r := r || jsonb_build_object('prueba', 'sube imágenes en la carpeta de su empresa', 'ok', false, 'detalle', sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('empresas', v_ajena || '/logo-prueba.png');
    r := r || jsonb_build_object('prueba', 'no sube en la carpeta de otra empresa', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no sube en la carpeta de otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('empresas', 'logo-sin-carpeta.png');
    r := r || jsonb_build_object('prueba', 'no sube fuera de una carpeta de empresa', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no sube fuera de una carpeta de empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  -- ── Vendedor ─────────────────────────────────────────────────────────────
  reset role;
  if v_vend is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.guardar_cuentas_bancarias(v_emp, '[]');
      r := r || jsonb_build_object('prueba', 'vendedor no edita cuentas', 'ok', false, 'detalle', 'no falló');
    exception when others then
      r := r || jsonb_build_object('prueba', 'vendedor no edita cuentas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
    end;
    begin
      insert into storage.objects (bucket_id, name) values ('empresas', v_emp || '/logo-vendedor.png');
      r := r || jsonb_build_object('prueba', 'vendedor no sube logos', 'ok', false, 'detalle', 'se pudo');
    exception when others then
      r := r || jsonb_build_object('prueba', 'vendedor no sube logos', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
    end;
    reset role;
  end if;

  -- ── Asignaciones como superadmin ─────────────────────────────────────────
  select empresa_id into v_otra from public.usuario_empresa
   where usuario_id = v_admin and empresa_id <> v_emp and activo order by empresa_id limit 1;
  select id, rol into v_id_antes, v_rol from public.usuario_empresa where usuario_id = v_admin and empresa_id = v_emp;
  update public.usuario_empresa set rol = 'admin' where id = v_id_antes;

  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.asignar_empresas_usuario(v_admin, array[v_emp, v_ajena]);

  select count(*) into v_n from public.usuario_empresa where id = v_id_antes and rol = 'admin';
  r := r || jsonb_build_object('prueba', 'conserva la asignación que se mantiene (mismo id y rol)', 'ok', v_n = 1, 'detalle', '');
  select count(*) into v_n from public.usuario_empresa where usuario_id = v_admin and empresa_id = v_ajena and activo;
  r := r || jsonb_build_object('prueba', 'agrega la empresa nueva', 'ok', v_n = 1, 'detalle', v_ajena);
  select count(*) into v_n from public.usuario_empresa where usuario_id = v_admin and empresa_id = v_otra;
  r := r || jsonb_build_object('prueba', 'quita la empresa que ya no está', 'ok', v_otra is null or v_n = 0, 'detalle', coalesce(v_otra, 'sin otra'));

  perform public.asignar_empresas_usuario(v_admin, array['NO_EXISTE']);
  select count(*) into v_n from public.usuario_empresa where usuario_id = v_admin;
  r := r || jsonb_build_object('prueba', 'ignora empresas inexistentes', 'ok', v_n = 0, 'detalle', v_n || ' asignaciones');

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
