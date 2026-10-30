-- Pruebas de crear_cotizacion() y de los permisos sobre cotizaciones.
-- Simula a un vendedor real (con una sola empresa) sin iniciar sesión.
-- Todo corre en una transacción que se deshace al final: no modifica nada.
--
-- Requiere aplicadas 20261029020000 y 20261029030000.
-- Uso: supabase db query --linked -f supabase/pruebas_cotizaciones.sql

begin;

do $$
declare
  r          jsonb := '[]'::jsonb;
  v_vend     uuid;
  v_emp      text;
  v_ajena    text;
  v_cliente  constant jsonb := '{"nombre":"CLIENTE DE PRUEBA SAC","documento":"20999999991","telefono":"999 888 777"}';
  v_item     constant jsonb := '[{"descripcion":"Ítem de prueba","cantidad":1,"precio_unitario":10}]';
  c1 public.cotizaciones;
  c2 public.cotizaciones;
  c3 public.cotizaciones;
  c4 public.cotizaciones;
  c5 public.cotizaciones;
  v_n        int;
  v_estado   text;
  v_folio    text;
  v_sec      int;
begin
  -- ── Contexto (como postgres) ─────────────────────────────────────────────
  select p.id, ue.empresa_id into v_vend, v_emp
    from public.profiles p
    join public.usuario_empresa ue on ue.usuario_id = p.id and ue.activo
   where p.rol = 'vendedor' and p.activo
     and (select count(*) from public.usuario_empresa u where u.usuario_id = p.id and u.activo) = 1
   limit 1;
  if v_vend is null then
    raise exception 'No hay un vendedor activo con exactamente una empresa para probar.';
  end if;
  select id into v_ajena from public.empresas where id <> v_emp order by id limit 1;

  -- Migración: datos existentes
  select count(*) into v_n from public.cotizaciones where incluye_igv is distinct from (igv > 0);
  r := r || jsonb_build_object('prueba', 'incluye_igv relleno según el IGV guardado', 'ok', v_n = 0, 'detalle', v_n || ' distintas');
  select count(*) into v_n from public.cotizaciones
   where tipo_origen = 'revision' and cotizacion_origen_id is not null and folio_origen is not null;
  r := r || jsonb_build_object('prueba', 'revisión vieja enlazada a su original', 'ok', v_n >= 1, 'detalle', v_n || ' enlazadas');

  -- ── Como vendedor ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  set local role authenticated;

  c1 := public.crear_cotizacion(
    v_emp, v_cliente,
    '[{"descripcion":"  Arena gruesa ","unidad":"m3","cantidad":2.5,"precio_unitario":16,"subtotal":1},
      {"descripcion":"Piedra chancada","cantidad":3,"precio_unitario":33.333,"subtotal":0}]',
    true, 'OBRA', '  nota  ', '{"diasValidez":"30","mostrarCuentas":false,"basura":"x"}');

  r := r || jsonb_build_object('prueba', 'totales calculados por el servidor (140 + 25.20 = 165.20)',
         'ok', c1.subtotal = 140.00 and c1.igv = 25.20 and c1.total = 165.20,
         'detalle', format('%s + %s = %s', c1.subtotal, c1.igv, c1.total));
  r := r || jsonb_build_object('prueba', 'subtotal enviado por el navegador se ignora',
         'ok', (c1.items->0->>'subtotal')::numeric = 40.00 and (c1.items->1->>'subtotal')::numeric = 100.00,
         'detalle', (c1.items->0->>'subtotal') || ', ' || (c1.items->1->>'subtotal'));
  r := r || jsonb_build_object('prueba', 'descripción recortada y unidad por defecto',
         'ok', c1.items->0->>'descripcion' = 'Arena gruesa' and c1.items->1->>'unidad' = 'und',
         'detalle', (c1.items->0->>'descripcion') || ' / ' || (c1.items->1->>'unidad'));
  r := r || jsonb_build_object('prueba', 'folio con formato PREFIJO-00000000', 'ok', c1.folio ~ '^[A-Z0-9]+-\d{8}$', 'detalle', c1.folio);
  r := r || jsonb_build_object('prueba', 'nace PENDIENTE con autor', 'ok', c1.estado = 'PENDIENTE' and c1.creado_por = v_vend and c1.vendedor is not null, 'detalle', c1.estado);
  r := r || jsonb_build_object('prueba', 'condiciones saneadas (solo claves conocidas)',
         'ok', c1.condiciones = '{"diasValidez":30,"mostrarCuentas":false,"mostrarValidez":true,"mostrarContacto":false}'::jsonb,
         'detalle', c1.condiciones::text);
  r := r || jsonb_build_object('prueba', 'observaciones y lugar recortados', 'ok', c1.observaciones = 'nota' and c1.lugar_entrega = 'OBRA', 'detalle', c1.observaciones);
  select count(*) into v_n from public.clientes where id = c1.cliente_id and empresa_id = v_emp and telefono = '999 888 777';
  r := r || jsonb_build_object('prueba', 'cliente nuevo guardado en la cartera', 'ok', v_n = 1, 'detalle', coalesce(c1.cliente_id::text, 'sin cliente'));

  c2 := public.crear_cotizacion(v_emp, '{"nombre":"CLIENTE DE PRUEBA SAC","documento":"20999999991"}', v_item, false);
  r := r || jsonb_build_object('prueba', 'folio consecutivo', 'ok', split_part(c2.folio, '-', 2)::int = split_part(c1.folio, '-', 2)::int + 1, 'detalle', c1.folio || ' → ' || c2.folio);
  r := r || jsonb_build_object('prueba', 'sin IGV', 'ok', c2.igv = 0 and c2.total = 10 and not c2.incluye_igv, 'detalle', format('igv %s, total %s', c2.igv, c2.total));
  select count(*) into v_n from public.clientes where id = c2.cliente_id and telefono = '999 888 777';
  r := r || jsonb_build_object('prueba', 'cliente existente conserva su teléfono', 'ok', c2.cliente_id = c1.cliente_id and v_n = 1, 'detalle', '');

  -- Validaciones: cada una debe fallar con el código esperado.
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, '[]');
    r := r || jsonb_build_object('prueba', 'rechaza sin ítems', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza sin ítems', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, '{"descripcion":"x"}');
    r := r || jsonb_build_object('prueba', 'rechaza ítems que no son lista', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza ítems que no son lista', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, '[{"descripcion":"x","cantidad":1,"precio_unitario":-5}]');
    r := r || jsonb_build_object('prueba', 'rechaza precio negativo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza precio negativo', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, '[{"descripcion":"x","cantidad":0,"precio_unitario":5}]');
    r := r || jsonb_build_object('prueba', 'rechaza cantidad 0', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza cantidad 0', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, '[{"descripcion":"x","cantidad":"abc","precio_unitario":5}]');
    r := r || jsonb_build_object('prueba', 'rechaza cantidad no numérica', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza cantidad no numérica', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, '[{"descripcion":"   ","cantidad":1,"precio_unitario":5}]');
    r := r || jsonb_build_object('prueba', 'rechaza ítem sin descripción', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza ítem sin descripción', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, '{"nombre":"Sin documento"}', v_item);
    r := r || jsonb_build_object('prueba', 'rechaza cliente sin RUC/DNI', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza cliente sin RUC/DNI', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, '[{"descripcion":"x","cantidad":99999999,"precio_unitario":2}]');
    r := r || jsonb_build_object('prueba', 'rechaza total mayor al máximo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza total mayor al máximo', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_ajena, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'rechaza empresa ajena', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza empresa ajena', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, v_item, p_tipo_origen => 'revision');
    r := r || jsonb_build_object('prueba', 'rechaza revisión sin original', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza revisión sin original', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;

  -- Revisión: la original se anula solo al guardar la nueva.
  c3 := public.crear_cotizacion(v_emp, v_cliente, v_item, p_origen_id => c1.id, p_tipo_origen => 'revision');
  select estado into v_estado from public.cotizaciones where id = c1.id;
  r := r || jsonb_build_object('prueba', 'revisión enlazada y original anulada',
         'ok', c3.cotizacion_origen_id = c1.id and c3.tipo_origen = 'revision' and c3.folio_origen = c1.folio
               and v_estado = 'ANULADA',
         'detalle', c1.folio || ' ' || v_estado || ' → ' || c3.folio);
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, v_item, p_origen_id => c1.id, p_tipo_origen => 'revision');
    r := r || jsonb_build_object('prueba', 'no se revisa dos veces la misma', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no se revisa dos veces la misma', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  begin
    update public.cotizaciones set estado = 'PENDIENTE' where id = c1.id;
    r := r || jsonb_build_object('prueba', 'original reemplazada no se reactiva', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'original reemplazada no se reactiva', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;

  -- Duplicado: la original queda intacta.
  c4 := public.crear_cotizacion(v_emp, v_cliente, v_item, p_origen_id => c2.id, p_tipo_origen => 'duplicado');
  c5 := public.crear_cotizacion(v_emp, v_cliente, v_item, p_origen_id => c2.id, p_tipo_origen => 'duplicado');
  select estado into v_estado from public.cotizaciones where id = c2.id;
  r := r || jsonb_build_object('prueba', 'duplicar no toca la original (y se puede repetir)',
         'ok', v_estado = 'PENDIENTE' and c4.tipo_origen = 'duplicado' and c5.cotizacion_origen_id = c2.id,
         'detalle', c2.folio || ' sigue ' || v_estado);

  -- Escritura directa (tras 20261029030000)
  begin
    insert into public.cotizaciones (folio, empresa_id, cliente_nombre, cliente_documento, subtotal, igv, total, items)
    values ('FALSO-1', v_emp, 'x', 'x', 0, 0, 0, '[]');
    r := r || jsonb_build_object('prueba', 'insert directo bloqueado', 'ok', false, 'detalle', 'se pudo insertar');
  exception when others then
    r := r || jsonb_build_object('prueba', 'insert directo bloqueado', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    update public.cotizaciones set total = 1 where id = c2.id;
    r := r || jsonb_build_object('prueba', 'no se puede cambiar el total', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no se puede cambiar el total', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    update public.cotizaciones set folio = 'OTRO-1' where id = c2.id;
    r := r || jsonb_build_object('prueba', 'no se puede cambiar el folio', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no se puede cambiar el folio', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    delete from public.cotizaciones where id = c2.id;
    r := r || jsonb_build_object('prueba', 'no se puede borrar', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no se puede borrar', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    update public.folios_empresas set secuencia = 0 where empresa_codigo = v_emp;
    r := r || jsonb_build_object('prueba', 'contador de folios intocable', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'contador de folios intocable', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.getnextfolioempresa(v_emp);
    r := r || jsonb_build_object('prueba', 'función vieja de folios eliminada', 'ok', false, 'detalle', 'sigue existiendo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'función vieja de folios eliminada', 'ok', sqlstate = '42883', 'detalle', sqlerrm);
  end;

  update public.cotizaciones set estado = 'APROBADA', oculta = true where id = c2.id;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('prueba', 'sí se puede cambiar estado y ocultar', 'ok', v_n = 1, 'detalle', v_n || ' fila');
  update public.cotizaciones set estado = 'ANULADA' where empresa_id = v_ajena;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('prueba', 'no ve ni cambia cotizaciones de otra empresa', 'ok', v_n = 0, 'detalle', v_n || ' filas');

  -- ── Contador desfasado: el folio siguiente ya existe ─────────────────────
  reset role;
  select secuencia into v_sec from public.folios_empresas where empresa_codigo = v_emp;
  v_folio := split_part(c5.folio, '-', 1) || '-' || lpad((v_sec + 1)::text, 8, '0');
  insert into public.cotizaciones (folio, empresa_id, cliente_nombre, cliente_documento, subtotal, igv, total, items)
  values (v_folio, v_emp, 'x', 'x', 0, 0, 0, '[]');
  set local role authenticated;
  c1 := public.crear_cotizacion(v_emp, v_cliente, v_item);
  r := r || jsonb_build_object('prueba', 'salta un folio que ya existe', 'ok', split_part(c1.folio, '-', 2)::int = v_sec + 2, 'detalle', v_folio || ' ocupado → ' || c1.folio);

  -- ── Sin sesión, anónimo y usuario desactivado ────────────────────────────
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'rechaza sin sesión', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza sin sesión', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  reset role;
  set local role anon;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'anónimo no puede ejecutarla', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anónimo no puede ejecutarla', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  reset role;
  update public.profiles set activo = false where id = v_vend;
  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.crear_cotizacion(v_emp, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'usuario desactivado no puede', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'usuario desactivado no puede', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
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
