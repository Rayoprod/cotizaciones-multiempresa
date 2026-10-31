-- Pruebas del rol Encargado y de las salidas de cantera (20261031020000).
-- Crea sus propias empresas y cuentas, y simula a cada una sin iniciar sesión.
-- Todo corre en una transacción que se deshace al final: no modifica nada.
--
-- Uso: supabase db query --linked -f supabase/pruebas_cantera.sql

begin;

create function pg_temp.como(p_usuario uuid)
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Devuelve el código del error, o 'ok' si no falló.
create function pg_temp.falla(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

create function pg_temp.salida(
  p_empresa text, p_venta uuid, p_item uuid, p_cliente text, p_material text, p_unidad text, p_cantidad numeric, p_placa text,
  p_chofer text default null, p_momento timestamptz default null, p_id uuid default gen_random_uuid()
)
returns jsonb
language sql
as $$
  select public.registrar_salida(p_id, p_empresa, p_venta, p_item, p_cliente, null, p_material, p_unidad, p_cantidad, p_placa,
                                 p_chofer, null, p_momento);
$$;

grant execute on all functions in schema pg_temp to authenticated;

do $$
declare
  r          jsonb := '[]'::jsonb;
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_super    uuid := gen_random_uuid();
  v_admin    uuid := gen_random_uuid();
  v_vend     uuid := gen_random_uuid();
  v_enc      uuid := gen_random_uuid();
  v_enc2     uuid := gen_random_uuid();
  v_ajeno    uuid := gen_random_uuid();
  v_emp      constant text := 'PRUEBA_CANTERA';
  v_otra     constant text := 'PRUEBA_OTRA';
  v_cliente  constant jsonb := '{"nombre":"CONSTRUCTORA DE PRUEBA SAC","documento":"20999999991"}';
  v          jsonb;
  w          jsonb;
  d          jsonb;
  s          jsonb;
  v_id       uuid;
  v_id2      uuid;
  v_item     uuid;
  v_item2    uuid;
  v_serv     uuid;
  v_ajena    jsonb;
  v_ajena_i  uuid;
  v_sid      uuid;
  v_sid2     uuid;
  v_n        int;
  v_num      numeric;
  v_txt      text;
  v_ok       boolean;
begin
  -- ── Contexto (como postgres) ─────────────────────────────────────────────
  insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', e, 'authenticated', 'authenticated', now(), now()
    from (values (v_super, 'super-cantera@ejemplo.invalid'), (v_admin, 'admin-cantera@ejemplo.invalid'),
                 (v_vend, 'vend-cantera@ejemplo.invalid'), (v_enc, 'enc-cantera@ejemplo.invalid'),
                 (v_enc2, 'enc2-cantera@ejemplo.invalid'), (v_ajeno, 'ajeno-cantera@ejemplo.invalid')) x(u, e);
  update public.profiles set rol = 'admin' where id = v_super;
  update public.profiles set nombre = 'Encargado Prueba' where id = v_enc;

  insert into public.empresas (id, nombre_comercial, ruc, color, prefijo, activa)
  values (v_emp, 'Cantera de prueba', '20000000001', '#0f766e', 'PCN', true),
         (v_otra, 'Otra cantera', '20000000002', '#0f766e', 'POT', true);
  insert into public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, moneda, numero)
  values (v_emp, 'BCP', 'Corriente', 'PEN', '191-000');
  insert into public.usuario_empresa (usuario_id, empresa_id, rol, activo)
  values (v_admin, v_emp, 'admin', true), (v_vend, v_emp, 'vendedor', true),
         (v_enc, v_emp, 'encargado', true), (v_enc2, v_emp, 'encargado', true),
         (v_ajeno, v_otra, 'admin', true);
  insert into public.productos (codigo_sku, descripcion, unidad, precio_unitario_base, empresa_id)
  values ('PRD-A', 'Arena de prueba', 'm3', 50, v_emp), ('PRD-F', 'Flete de prueba', 'viaje', 300, v_emp);

  -- La oficina vende: 100 m³ de arena, 40 m³ de piedra y un flete.
  perform pg_temp.como(v_vend);
  v := public.crear_venta(v_emp, v_cliente,
    '[{"sku":"PRD-A","descripcion":"Arena de prueba","unidad":"m3","cantidad":100,"precio_unitario":50},
      {"descripcion":"Piedra de prueba","unidad":"m3","cantidad":40,"precio_unitario":60},
      {"sku":"PRD-F","descripcion":"Flete de prueba","unidad":"viaje","cantidad":1,"precio_unitario":300}]',
    p_observaciones => 'Debe S/ 500 de la venta anterior');
  v_id := (v->>'id')::uuid;
  v_item := (v->'venta_items'->0->>'id')::uuid;
  v_item2 := (v->'venta_items'->1->>'id')::uuid;
  v_serv := (v->'venta_items'->2->>'id')::uuid;

  -- ── El encargado no ve lo de oficina ─────────────────────────────────────
  perform pg_temp.como(v_enc);
  r := r || jsonb_build_object('prueba', 'encargado: sin acceso de oficina y con acceso a la cantera de su empresa',
         'ok', not public.tiene_acceso_empresa(v_emp) and public.tiene_acceso_cantera(v_emp) and not public.tiene_acceso_cantera(v_otra),
         'detalle', '');
  select count(*) into v_n from jsonb_array_elements(public.mis_empresas()) e
   where e->>'id' = v_emp and e->>'mi_rol' = 'encargado' and e->'cuentas_bancarias' = '[]'::jsonb and e ? 'modulos';
  r := r || jsonb_build_object('prueba', 'encargado: ve su empresa, con su rol y sin cuentas bancarias', 'ok', v_n = 1
           and jsonb_array_length(public.mis_empresas()) = 1, 'detalle', v_n || ' de 1');

  select (select count(*) from public.ventas where empresa_id = v_emp)
       + (select count(*) from public.venta_items where empresa_id = v_emp)
       + (select count(*) from public.pagos where empresa_id = v_emp)
       + (select count(*) from public.venta_comprobantes where empresa_id = v_emp)
       + (select count(*) from public.venta_cambios where empresa_id = v_emp)
       + (select count(*) from public.folios_documentos where empresa_id = v_emp)
       + (select count(*) from public.cotizaciones where empresa_id = v_emp)
       + (select count(*) from public.clientes where empresa_id = v_emp)
       + (select count(*) from public.productos where empresa_id = v_emp)
       + (select count(*) from public.cuentas_bancarias where empresa_id = v_emp)
       + (select count(*) from public.folios_empresas where empresa_codigo = v_emp)
       + (select count(*) from public.maquinaria where empresa_id = v_emp)
       + (select count(*) from public.salidas where empresa_id = v_emp)
       + (select count(*) from public.vehiculos where empresa_id = v_emp)
    into v_n;
  r := r || jsonb_build_object('prueba', 'encargado: no lee ninguna tabla de oficina', 'ok', v_n = 0, 'detalle', v_n || ' filas');

  v_txt := pg_temp.falla(format('select public.crear_venta(%L, %L, %L)', v_emp, v_cliente, '[{"descripcion":"x","cantidad":1,"precio_unitario":1}]'));
  r := r || jsonb_build_object('prueba', 'encargado: no vende', 'ok', v_txt = '42501', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.crear_cotizacion(%L, %L, %L)', v_emp, v_cliente, '[{"descripcion":"x","cantidad":1,"precio_unitario":1}]'));
  r := r || jsonb_build_object('prueba', 'encargado: no cotiza', 'ok', v_txt = '42501', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.registrar_pago(%L, 10, %L)', v_id, 'EFECTIVO'));
  r := r || jsonb_build_object('prueba', 'encargado: no recibe pagos', 'ok', v_txt = '42501', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.marcar_entrega_venta(%L, %L)', v_id, 'ENTREGADA'));
  r := r || jsonb_build_object('prueba', 'encargado: no marca entregas a mano', 'ok', v_txt = '42501', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.agregar_comprobante_venta(%L, %L, %L, 10)', v_id, 'FACTURA', 'F001-1'));
  r := r || jsonb_build_object('prueba', 'encargado: no anota facturas', 'ok', v_txt = '42501', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.detener_salidas_venta(%L, true, %L)', v_id, 'x'));
  r := r || jsonb_build_object('prueba', 'encargado: no detiene ventas', 'ok', v_txt = '42501', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.guardar_vehiculo(%L, null, %L, 25, %L)', v_emp, 'AAA111', 'PROPIO'));
  r := r || jsonb_build_object('prueba', 'encargado: no edita volquetes', 'ok', v_txt = '42501', 'detalle', v_txt);
  v_txt := pg_temp.falla(format($f$insert into storage.objects (bucket_id, name) values ('comprobantes', %L)$f$, v_emp || '/' || v_id || '/x.pdf'));
  r := r || jsonb_build_object('prueba', 'encargado: no sube facturas', 'ok', v_txt = '42501', 'detalle', v_txt);

  -- ── Lo que baja al celular ───────────────────────────────────────────────
  d := public.datos_cantera(v_emp);
  v_ok := true;
  foreach v_txt in array array['precio', 'total', 'pagado', 'saldo', 'importe', 'subtotal', 'igv', 'descuento', 'monto', 'observaciones', 'debe s/', 'documento', 'motivo_detencion'] loop
    if position(v_txt in lower(d::text)) > 0 then
      v_ok := false;
      r := r || jsonb_build_object('prueba', 'datos_cantera: sin "' || v_txt || '"', 'ok', false, 'detalle', 'aparece');
    end if;
  end loop;
  r := r || jsonb_build_object('prueba', 'datos_cantera: sin montos, deudas ni observaciones', 'ok', v_ok, 'detalle', '');
  r := r || jsonb_build_object('prueba', 'datos_cantera: la venta con sus líneas de material, sin el flete',
         'ok', jsonb_array_length(d->'ventas') = 1 and jsonb_array_length(d->'ventas'->0->'lineas') = 2
               and d->'ventas'->0->>'cliente' = 'CONSTRUCTORA DE PRUEBA SAC'
               and (d->'ventas'->0->'lineas'->0->>'cantidad')::numeric = 100 and (d->'ventas'->0->'lineas'->0->>'entregado')::numeric = 0,
         'detalle', jsonb_array_length(d->'ventas'->0->'lineas') || ' líneas');
  r := r || jsonb_build_object('prueba', 'datos_cantera: capacidad de 25 m³ y catálogo sin servicios',
         'ok', (d->>'capacidad_m3')::numeric = 25 and jsonb_array_length(d->'materiales') = 1 and d->'materiales'->0->>'material' = 'Arena de prueba',
         'detalle', d->>'capacidad_m3');
  v_txt := pg_temp.falla(format('select public.datos_cantera(%L)', v_otra));
  r := r || jsonb_build_object('prueba', 'datos_cantera: de otra empresa, no', 'ok', v_txt = '42501', 'detalle', v_txt);

  -- ── Registrar ────────────────────────────────────────────────────────────
  v_sid := gen_random_uuid();
  s := pg_temp.salida(v_emp, v_id, v_item, 'lo que escribió', 'lo que escribió', 'und', 25, ' abc-123 ', 'Juan', null, v_sid);
  r := r || jsonb_build_object('prueba', 'salida: toma de la venta el cliente, el material y la unidad',
         'ok', s->>'cliente' = 'CONSTRUCTORA DE PRUEBA SAC' and s->>'material' = 'Arena de prueba' and s->>'unidad' = 'm3'
               and s->>'folio_venta' = v->>'folio' and s->>'placa' = 'ABC123' and s->>'creado_por_nombre' = 'Encargado Prueba'
               and (s->>'fecha')::date = v_hoy and s->>'avisos' = '[]' and not (s->>'por_revisar')::boolean,
         'detalle', s->>'placa');

  w := pg_temp.salida(v_emp, v_id, v_item, null, 'x', 'm3', 25, 'ABC123', null, null, v_sid);
  select count(*) into v_n from public.salidas where id = v_sid;
  reset role;
  select entregado into v_num from public.venta_items where id = v_item;
  select count(*) into v_n from public.salidas where id = v_sid;
  r := r || jsonb_build_object('prueba', 'salida: enviarla dos veces no la duplica', 'ok', v_n = 1 and v_num = 25 and w->>'id' = v_sid::text, 'detalle', v_num || ' m³');
  select estado_entrega into v_txt from public.ventas where id = v_id;
  r := r || jsonb_build_object('prueba', 'venta: con la primera salida, entrega parcial', 'ok', v_txt = 'PARCIAL', 'detalle', v_txt);
  select count(*) into v_n from public.vehiculos where empresa_id = v_emp and placa = 'ABC123' and capacidad_m3 = 25 and chofer = 'Juan' and propietario is null and ultima_salida_en is not null;
  r := r || jsonb_build_object('prueba', 'placa nueva: se guarda con su capacidad y su chofer, por completar', 'ok', v_n = 1, 'detalle', v_n || ' de 1');

  perform pg_temp.como(v_enc);
  s := pg_temp.salida(v_emp, v_id, v_item, null, 'x', 'm3', 20, 'ABC123', 'Pedro');
  s := pg_temp.salida(v_emp, v_id, v_item, null, 'x', 'm3', 20, 'ABC123');
  reset role;
  select count(*) into v_n from public.vehiculos where empresa_id = v_emp and placa = 'ABC123' and capacidad_m3 = 25 and chofer = 'Pedro';
  r := r || jsonb_build_object('prueba', 'placa conocida: guarda el último chofer y no cambia la capacidad', 'ok', v_n = 1, 'detalle', v_n || ' de 1');

  -- Validaciones: lo que no es una salida
  perform pg_temp.como(v_enc);
  v_txt := pg_temp.falla(format('select pg_temp.salida(%L, null, null, %L, %L, %L, 10, %L)', v_emp, 'Cliente', 'Arena', 'm3', ' - '));
  r := r || jsonb_build_object('prueba', 'salida: sin placa se rechaza', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select pg_temp.salida(%L, null, null, %L, %L, %L, 0, %L)', v_emp, 'Cliente', 'Arena', 'm3', 'ABC123'));
  r := r || jsonb_build_object('prueba', 'salida: cantidad en cero se rechaza', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select pg_temp.salida(%L, null, null, null, %L, %L, 10, %L)', v_emp, 'Arena', 'm3', 'ABC123'));
  r := r || jsonb_build_object('prueba', 'salida sin venta: sin cliente se rechaza', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select pg_temp.salida(%L, null, null, %L, %L, %L, 10, %L)', v_otra, 'Cliente', 'Arena', 'm3', 'ABC123'));
  r := r || jsonb_build_object('prueba', 'salida: en otra empresa, no', 'ok', v_txt = '42501', 'detalle', v_txt);

  -- Sin venta: se guarda y queda por revisar
  s := pg_temp.salida(v_emp, null, null, 'Don Julio', 'Arena', 'm3', 10, 'XYZ-789');
  v_sid2 := (s->>'id')::uuid;
  r := r || jsonb_build_object('prueba', 'salida sin venta: se guarda con el cliente escrito y queda por revisar',
         'ok', s->>'cliente' = 'Don Julio' and (s->>'por_revisar')::boolean and s->>'venta_id' is null, 'detalle', s->>'por_revisar');

  -- La hora del celular
  s := pg_temp.salida(v_emp, null, null, 'Reloj adelantado', 'Arena', 'm3', 1, 'REL001', null, now() + interval '3 days');
  r := r || jsonb_build_object('prueba', 'celular con la hora adelantada: la fecha no queda en el futuro', 'ok', (s->>'fecha')::date = v_hoy, 'detalle', s->>'fecha');
  s := pg_temp.salida(v_emp, null, null, 'Sin señal', 'Arena', 'm3', 1, 'REL001', null, now() - interval '3 days');
  r := r || jsonb_build_object('prueba', 'salida de hace días: conserva cuándo salió y cuándo llegó',
         'ok', (s->>'fecha')::date = ((now() - interval '3 days') at time zone 'America/Lima')::date
               and (s->>'recibida_en')::timestamptz > (s->>'registrada_en')::timestamptz + interval '2 days', 'detalle', s->>'fecha');

  -- De más: se guarda y se marca
  s := pg_temp.salida(v_emp, v_id, v_item, null, 'x', 'm3', 40, 'ABC123');
  r := r || jsonb_build_object('prueba', 'de más: se guarda y se marca para revisar',
         'ok', s->'avisos' ? 'EXCEDE' and (s->>'por_revisar')::boolean, 'detalle', s->>'avisos');
  v_sid := (s->>'id')::uuid;
  reset role;
  select entregado into v_num from public.venta_items where id = v_item;
  r := r || jsonb_build_object('prueba', 'de más: cuenta en lo entregado', 'ok', v_num = 105, 'detalle', v_num || ' de 100');

  -- Línea que ya no está y venta de otra empresa
  perform pg_temp.como(v_enc);
  s := pg_temp.salida(v_emp, v_id, gen_random_uuid(), null, 'Arena', 'm3', 5, 'ABC123');
  r := r || jsonb_build_object('prueba', 'línea que ya no existe: se guarda en la venta y queda por revisar',
         'ok', s->>'venta_id' = v_id::text and s->>'venta_item_id' is null and s->'avisos' ? 'LINEA_QUITADA' and (s->>'por_revisar')::boolean, 'detalle', s->>'avisos');

  perform pg_temp.como(v_ajeno);
  v_ajena := public.crear_venta(v_otra, v_cliente, '[{"descripcion":"Ajena","unidad":"m3","cantidad":10,"precio_unitario":10}]');
  v_ajena_i := (v_ajena->'venta_items'->0->>'id')::uuid;
  perform pg_temp.como(v_enc);
  s := pg_temp.salida(v_emp, (v_ajena->>'id')::uuid, v_ajena_i, 'Cliente escrito', 'Arena', 'm3', 5, 'ABC123');
  r := r || jsonb_build_object('prueba', 'venta de otra empresa: no la toca ni dice de quién es',
         'ok', s->>'venta_id' is null and s->>'folio_venta' is null and s->>'cliente' = 'Cliente escrito', 'detalle', s->>'cliente');
  reset role;
  select entregado into v_num from public.venta_items where id = v_ajena_i;
  r := r || jsonb_build_object('prueba', 'venta de otra empresa: su entrega sigue igual', 'ok', v_num = 0, 'detalle', v_num::text);

  -- ── Anular ───────────────────────────────────────────────────────────────
  perform pg_temp.como(v_enc);
  v_txt := pg_temp.falla(format('select public.anular_salida(%L, %L)', v_sid, '  '));
  r := r || jsonb_build_object('prueba', 'anular: sin motivo, no', 'ok', v_txt = '22023', 'detalle', v_txt);
  perform pg_temp.como(v_enc2);
  v_txt := pg_temp.falla(format('select public.anular_salida(%L, %L)', v_sid, 'Mía no es'));
  r := r || jsonb_build_object('prueba', 'anular: la de otro encargado, no', 'ok', v_txt = '22023', 'detalle', v_txt);
  perform pg_temp.como(v_vend);
  v_txt := pg_temp.falla(format('select public.anular_salida(%L, %L)', v_sid, 'No la registré'));
  r := r || jsonb_build_object('prueba', 'anular: un vendedor, la de otro, no', 'ok', v_txt = '22023', 'detalle', v_txt);

  perform pg_temp.como(v_enc);
  s := public.anular_salida(v_sid, 'Me equivoqué de cantidad');
  r := r || jsonb_build_object('prueba', 'anular: quien la registró, el mismo día',
         'ok', s->>'estado' = 'ANULADA' and s->>'anulada_por_nombre' = 'Encargado Prueba' and s->>'motivo_anulacion' = 'Me equivoqué de cantidad' and not (s->>'por_revisar')::boolean,
         'detalle', s->>'estado');
  w := public.anular_salida(v_sid, 'Otra vez');
  r := r || jsonb_build_object('prueba', 'anular dos veces no cambia nada', 'ok', w->>'motivo_anulacion' = 'Me equivoqué de cantidad', 'detalle', '');
  reset role;
  select entregado into v_num from public.venta_items where id = v_item;
  r := r || jsonb_build_object('prueba', 'anular: lo entregado baja', 'ok', v_num = 65, 'detalle', v_num || ' m³');
  select count(*) into v_n from public.venta_cambios where venta_id = v_id and tipo = 'SALIDA_ANULADA' and motivo = 'Me equivoqué de cantidad';
  r := r || jsonb_build_object('prueba', 'anular: queda en el historial de la venta, una sola vez', 'ok', v_n = 1, 'detalle', v_n::text);

  -- Sin señal: anulada a tiempo, llega al día siguiente; y anular de verdad al día siguiente
  perform pg_temp.como(v_enc);
  s := pg_temp.salida(v_emp, null, null, 'Ayer', 'Arena', 'm3', 3, 'ABC123', null, now() - interval '1 day');
  v_txt := pg_temp.falla(format('select public.anular_salida(%L, %L)', s->>'id', 'Hoy ya no'));
  r := r || jsonb_build_object('prueba', 'anular: al día siguiente, el encargado no', 'ok', v_txt = '22023', 'detalle', v_txt);
  w := public.anular_salida((s->>'id')::uuid, 'Sin señal ayer', now() - interval '1 day');
  r := r || jsonb_build_object('prueba', 'anular: la anuló a tiempo sin señal y llega hoy, sí', 'ok', w->>'estado' = 'ANULADA', 'detalle', w->>'anulada_en');
  s := pg_temp.salida(v_emp, null, null, 'Ayer', 'Arena', 'm3', 3, 'ABC123', null, now() - interval '1 day');
  perform pg_temp.como(v_admin);
  w := public.anular_salida((s->>'id')::uuid, 'La revisó la oficina');
  r := r || jsonb_build_object('prueba', 'anular: un admin, cualquier día', 'ok', w->>'estado' = 'ANULADA' and w->>'venta_id' is null, 'detalle', w->>'estado');

  -- ── Oficina: leer, enlazar y revisar ─────────────────────────────────────
  perform pg_temp.como(v_vend);
  select count(*) into v_n from public.salidas where empresa_id = v_emp;
  r := r || jsonb_build_object('prueba', 'vendedor: ve las salidas de su empresa', 'ok', v_n > 0, 'detalle', v_n || ' salidas');
  select count(*) into v_n from public.salidas where empresa_id = v_otra;
  r := r || jsonb_build_object('prueba', 'vendedor: no ve las de otra empresa', 'ok', v_n = 0, 'detalle', v_n::text);
  v_txt := pg_temp.falla(format($f$insert into public.salidas (id, empresa_id, cliente, material, unidad, cantidad, placa, fecha, registrada_en) values (gen_random_uuid(), %L, 'x', 'x', 'm3', 1, 'X', now(), now())$f$, v_emp));
  r := r || jsonb_build_object('prueba', 'nadie escribe directo en salidas', 'ok', v_txt = '42501', 'detalle', v_txt);
  r := r || jsonb_build_object('prueba', 'vendedor: datos_cantera también le sirve', 'ok', jsonb_array_length(public.datos_cantera(v_emp)->'ventas') = 1, 'detalle', '');

  v_txt := pg_temp.falla(format('select public.enlazar_salida(%L, %L)', v_sid2, v_ajena_i));
  r := r || jsonb_build_object('prueba', 'enlazar: a una línea de otra empresa, no', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.enlazar_salida(%L, %L)', v_sid2, v_serv));
  r := r || jsonb_build_object('prueba', 'enlazar: a una línea con otra unidad, no', 'ok', v_txt = '22023', 'detalle', v_txt);

  s := public.enlazar_salida(v_sid2, v_item2);
  r := r || jsonb_build_object('prueba', 'enlazar: toma los datos de la venta y sale de por revisar',
         'ok', s->>'venta_id' = v_id::text and s->>'venta_item_id' = v_item2::text and s->>'cliente' = 'CONSTRUCTORA DE PRUEBA SAC'
               and s->>'material' = 'Piedra de prueba' and not (s->>'por_revisar')::boolean, 'detalle', s->>'por_revisar');
  reset role;
  select entregado into v_num from public.venta_items where id = v_item2;
  r := r || jsonb_build_object('prueba', 'enlazar: cuenta en lo entregado', 'ok', v_num = 10, 'detalle', v_num || ' m³');

  -- Pasar a otra venta si el encargado eligió mal
  perform pg_temp.como(v_vend);
  w := public.crear_venta(v_emp, v_cliente, '[{"descripcion":"Piedra de otra venta","unidad":"m3","cantidad":8,"precio_unitario":60}]');
  v_id2 := (w->>'id')::uuid;
  s := public.enlazar_salida(v_sid2, (w->'venta_items'->0->>'id')::uuid);
  r := r || jsonb_build_object('prueba', 'pasarla a otra venta: marca si se pasa de lo vendido',
         'ok', s->>'venta_id' = v_id2::text and s->'avisos' ? 'EXCEDE', 'detalle', s->>'avisos');
  reset role;
  select entregado into v_num from public.venta_items where id = v_item2;
  select estado_entrega into v_txt from public.ventas where id = v_id2;
  r := r || jsonb_build_object('prueba', 'pasarla a otra venta: recalcula las dos', 'ok', v_num = 0 and v_txt = 'ENTREGADA', 'detalle', v_num || ' m³, ' || v_txt);
  select count(*) into v_n from public.venta_cambios where venta_id = v_id and tipo = 'SALIDA_MOVIDA' and detalle->>'hacia' = w->>'folio';
  r := r || jsonb_build_object('prueba', 'pasarla a otra venta: queda en el historial de la anterior', 'ok', v_n = 1, 'detalle', v_n::text);

  perform pg_temp.como(v_vend);
  v_txt := pg_temp.falla(format('select public.revisar_salida(%L, %L)', v_sid2, ' '));
  r := r || jsonb_build_object('prueba', 'revisar: sin nota, no', 'ok', v_txt = '22023', 'detalle', v_txt);
  s := public.revisar_salida(v_sid2, 'Se le ampliará la venta');
  r := r || jsonb_build_object('prueba', 'revisar: sale de por revisar y deja quién y por qué',
         'ok', not (s->>'por_revisar')::boolean and s->>'nota_revision' = 'Se le ampliará la venta' and s->>'revisada_por_nombre' is not null, 'detalle', s->>'revisada_por_nombre');

  -- ── Detener ──────────────────────────────────────────────────────────────
  v_txt := pg_temp.falla(format('select public.detener_salidas_venta(%L, true, %L)', v_id, ' '));
  r := r || jsonb_build_object('prueba', 'detener: sin motivo, no', 'ok', v_txt = '22023', 'detalle', v_txt);
  v := public.detener_salidas_venta(v_id, true, 'Debe S/ 18,000');
  r := r || jsonb_build_object('prueba', 'detener: guarda quién y por qué',
         'ok', v->>'salidas_detenidas_en' is not null and v->>'motivo_detencion' = 'Debe S/ 18,000' and v->>'salidas_detenidas_por_nombre' is not null, 'detalle', v->>'motivo_detencion');
  v := public.detener_salidas_venta(v_id, true, 'Otra vez');
  r := r || jsonb_build_object('prueba', 'detener dos veces no pisa el motivo', 'ok', v->>'motivo_detencion' = 'Debe S/ 18,000', 'detalle', '');

  perform pg_temp.como(v_enc);
  d := public.datos_cantera(v_emp);
  select e into w from jsonb_array_elements(d->'ventas') e where e->>'id' = v_id::text;
  r := r || jsonb_build_object('prueba', 'detener: el encargado sabe que está detenida, no por qué',
         'ok', (w->>'detenida')::boolean and position('18,000' in d::text) = 0, 'detalle', w->>'detenida');

  s := pg_temp.salida(v_emp, v_id, v_item2, null, 'x', 'm3', 5, 'ABC123');
  r := r || jsonb_build_object('prueba', 'detenida: se registra igual y se marca', 'ok', s->'avisos' ? 'DETENIDA' and (s->>'por_revisar')::boolean, 'detalle', s->>'avisos');
  s := pg_temp.salida(v_emp, v_id, v_item2, null, 'x', 'm3', 5, 'ABC123', null, now() - interval '1 hour');
  r := r || jsonb_build_object('prueba', 'detenida: lo que salió antes de detenerla no se marca', 'ok', s->>'avisos' = '[]' and not (s->>'por_revisar')::boolean, 'detalle', s->>'avisos');

  perform pg_temp.como(v_vend);
  v := public.detener_salidas_venta(v_id, false);
  r := r || jsonb_build_object('prueba', 'reanudar: limpia la detención', 'ok', v->>'salidas_detenidas_en' is null and v->>'motivo_detencion' is null, 'detalle', '');
  reset role;
  select count(*) into v_n from public.venta_cambios where venta_id = v_id and tipo in ('SALIDAS_DETENIDAS', 'SALIDAS_REANUDADAS');
  r := r || jsonb_build_object('prueba', 'detener y reanudar: quedan en el historial', 'ok', v_n = 2, 'detalle', v_n::text);

  -- ── Ajustar y anular la venta con salidas ────────────────────────────────
  perform pg_temp.como(v_admin);
  v_txt := pg_temp.falla(format($f$select public.ajustar_venta(%L, %L, true, false, 0, null, null, 'CONTADO', null, 'Prueba')$f$, v_id,
    jsonb_build_array(jsonb_build_object('id', v_item, 'descripcion', 'Arena de prueba', 'unidad', 'm3', 'cantidad', 100, 'precio_unitario', 50),
                      jsonb_build_object('id', v_serv, 'descripcion', 'Flete de prueba', 'unidad', 'viaje', 'cantidad', 1, 'precio_unitario', 300))));
  r := r || jsonb_build_object('prueba', 'ajustar: no se quita una línea con salidas', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format($f$select public.ajustar_venta(%L, %L, true, false, 0, null, null, 'CONTADO', null, 'Prueba')$f$, v_id,
    jsonb_build_array(jsonb_build_object('id', v_item, 'descripcion', 'Arena de prueba', 'unidad', 'm3', 'cantidad', 50, 'precio_unitario', 50),
                      jsonb_build_object('id', v_item2, 'descripcion', 'Piedra de prueba', 'unidad', 'm3', 'cantidad', 40, 'precio_unitario', 60))));
  r := r || jsonb_build_object('prueba', 'ajustar: no se baja de lo entregado', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format($f$select public.ajustar_venta(%L, %L, true, false, 0, null, null, 'CONTADO', null, 'Prueba')$f$, v_id,
    jsonb_build_array(jsonb_build_object('id', v_item, 'descripcion', 'Arena de prueba', 'unidad', 'und', 'cantidad', 100, 'precio_unitario', 50),
                      jsonb_build_object('id', v_item2, 'descripcion', 'Piedra de prueba', 'unidad', 'm3', 'cantidad', 40, 'precio_unitario', 60))));
  r := r || jsonb_build_object('prueba', 'ajustar: no se cambia la unidad de una línea con salidas', 'ok', v_txt = '22023', 'detalle', v_txt);

  -- Quitar el flete, que no tiene salidas, y dejar lo demás justo en lo entregado: queda entregada
  reset role;
  select entregado into v_num from public.venta_items where id = v_item;
  perform pg_temp.como(v_admin);
  v := public.ajustar_venta(v_id,
    jsonb_build_array(jsonb_build_object('id', v_item, 'descripcion', 'Arena de prueba', 'unidad', 'm3', 'cantidad', v_num, 'precio_unitario', 50),
                      jsonb_build_object('id', v_item2, 'descripcion', 'Piedra de prueba', 'unidad', 'm3', 'cantidad', 10, 'precio_unitario', 60)),
    true, false, 0, null, null, 'CONTADO', null, 'Se ajusta a lo entregado');
  r := r || jsonb_build_object('prueba', 'ajustar: bajar justo a lo entregado completa la venta', 'ok', v->>'estado_entrega' = 'ENTREGADA', 'detalle', v->>'estado_entrega');
  d := public.datos_cantera(v_emp);
  select count(*) into v_n from jsonb_array_elements(d->'ventas') e where e->>'id' = v_id::text;
  r := r || jsonb_build_object('prueba', 'venta entregada: ya no baja al celular', 'ok', v_n = 0, 'detalle', v_n::text);
  v := public.ajustar_venta(v_id,
    jsonb_build_array(jsonb_build_object('id', v_item, 'descripcion', 'Arena de prueba', 'unidad', 'm3', 'cantidad', 500, 'precio_unitario', 50),
                      jsonb_build_object('id', v_item2, 'descripcion', 'Piedra de prueba', 'unidad', 'm3', 'cantidad', 10, 'precio_unitario', 60)),
    true, false, 0, null, null, 'CONTADO', null, 'Se amplía');
  r := r || jsonb_build_object('prueba', 'ajustar: ampliarla la vuelve a parcial', 'ok', v->>'estado_entrega' = 'PARCIAL', 'detalle', v->>'estado_entrega');

  v_txt := pg_temp.falla(format('select public.marcar_entrega_venta(%L, %L)', v_id, 'ENTREGADA'));
  r := r || jsonb_build_object('prueba', 'con salidas, la entrega no se marca a mano', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.anular_venta(%L, %L)', v_id, 'Prueba'));
  r := r || jsonb_build_object('prueba', 'con salidas vigentes, la venta no se anula', 'ok', v_txt = 'P0001', 'detalle', v_txt);

  -- Venta sin salidas: se marca a mano como siempre, y una marcada como entregada no baja al celular
  w := public.crear_venta(v_emp, v_cliente, '[{"descripcion":"Deuda antigua","unidad":"m3","cantidad":8,"precio_unitario":60}]');
  w := public.marcar_entrega_venta((w->>'id')::uuid, 'ENTREGADA');
  r := r || jsonb_build_object('prueba', 'sin salidas, la entrega se marca a mano', 'ok', w->>'estado_entrega' = 'ENTREGADA', 'detalle', w->>'estado_entrega');
  d := public.datos_cantera(v_emp);
  select count(*) into v_n from jsonb_array_elements(d->'ventas') e where e->>'id' = w->>'id';
  r := r || jsonb_build_object('prueba', 'marcada entregada a mano: no baja al celular', 'ok', v_n = 0, 'detalle', v_n::text);

  -- Venta solo de servicios: no baja al celular y no se recalcula
  w := public.crear_venta(v_emp, v_cliente, '[{"descripcion":"Alquiler","unidad":"hora","cantidad":8,"precio_unitario":60}]');
  select count(*) into v_n from jsonb_array_elements(public.datos_cantera(v_emp)->'ventas') e where e->>'id' = w->>'id';
  r := r || jsonb_build_object('prueba', 'venta solo de servicios: no baja al celular', 'ok', v_n = 0, 'detalle', v_n::text);

  -- Venta que anularon: la salida llega igual, sin venta, y se puede enlazar a otra
  w := public.crear_venta(v_emp, v_cliente, '[{"descripcion":"Venta que se anula","unidad":"m3","cantidad":8,"precio_unitario":60}]');
  perform public.anular_venta((w->>'id')::uuid, 'El cliente desistió');
  perform pg_temp.como(v_enc);
  s := pg_temp.salida(v_emp, (w->>'id')::uuid, (w->'venta_items'->0->>'id')::uuid, 'Lo escrito', 'x', 'm3', 8, 'ABC123');
  r := r || jsonb_build_object('prueba', 'venta anulada mientras no había señal: la salida llega y se marca',
         'ok', s->>'venta_id' is null and s->>'folio_venta' = w->>'folio' and s->'avisos' ? 'VENTA_ANULADA' and (s->>'por_revisar')::boolean,
         'detalle', s->>'avisos');
  perform pg_temp.como(v_vend);
  s := public.enlazar_salida((s->>'id')::uuid, v_item);
  r := r || jsonb_build_object('prueba', 'enlazarla quita el aviso de venta anulada', 'ok', not s->'avisos' ? 'VENTA_ANULADA' and not (s->>'por_revisar')::boolean, 'detalle', s->>'avisos');

  -- ── Volquetes ────────────────────────────────────────────────────────────
  s := public.guardar_vehiculo(v_emp, null, 'pqr-456', 18.5, 'TERCERO', 'Luis');
  r := r || jsonb_build_object('prueba', 'volquete: la oficina lo agrega con la placa normalizada',
         'ok', s->>'placa' = 'PQR456' and (s->>'capacidad_m3')::numeric = 18.5 and s->>'propietario' = 'TERCERO', 'detalle', s->>'placa');
  v_txt := pg_temp.falla(format('select public.guardar_vehiculo(%L, null, %L, 20, %L)', v_emp, 'PQR 456', 'PROPIO'));
  r := r || jsonb_build_object('prueba', 'volquete: la misma placa no se repite', 'ok', v_txt = '22023', 'detalle', v_txt);
  v_txt := pg_temp.falla(format('select public.guardar_vehiculo(%L, null, %L, 0, %L)', v_emp, 'NUE123', 'PROPIO'));
  r := r || jsonb_build_object('prueba', 'volquete: capacidad en cero, no', 'ok', v_txt = '22023', 'detalle', v_txt);
  w := public.guardar_vehiculo(v_emp, (s->>'id')::uuid, 'PQR456', 20, 'PROPIO', 'Luis', false);
  r := r || jsonb_build_object('prueba', 'volquete: se actualiza y se puede dar de baja', 'ok', (w->>'capacidad_m3')::numeric = 20 and not (w->>'activo')::boolean, 'detalle', '');
  select count(*) into v_n from jsonb_array_elements(public.datos_cantera(v_emp)->'vehiculos') e where e->>'placa' = 'PQR456';
  r := r || jsonb_build_object('prueba', 'volquete de baja: no baja al celular', 'ok', v_n = 0, 'detalle', v_n::text);
  perform pg_temp.como(v_ajeno);
  v_txt := pg_temp.falla(format('select public.guardar_vehiculo(%L, %L, %L, 20, %L)', v_otra, s->>'id', 'PQR456', 'PROPIO'));
  r := r || jsonb_build_object('prueba', 'volquete de otra empresa: no se toca', 'ok', v_txt = '22023', 'detalle', v_txt);

  -- ── Módulos y capacidad ──────────────────────────────────────────────────
  perform pg_temp.como(v_admin);
  v_txt := pg_temp.falla(format($f$update public.empresas set modulos = '{salidas}' where id = %L$f$, v_emp));
  r := r || jsonb_build_object('prueba', 'el admin de la empresa no activa módulos', 'ok', v_txt = '42501', 'detalle', v_txt);
  update public.empresas set capacidad_volquete_m3 = 20, modulos = modulos where id = v_emp;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('prueba', 'el admin de la empresa sí cambia la capacidad', 'ok', v_n = 1, 'detalle', '');
  perform pg_temp.como(v_super);
  update public.empresas set modulos = '{salidas}' where id = v_emp;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('prueba', 'el superadmin activa módulos', 'ok', v_n = 1, 'detalle', '');
  v_txt := pg_temp.falla(format($f$update public.empresas set modulos = '{inventado}' where id = %L$f$, v_emp));
  r := r || jsonb_build_object('prueba', 'un módulo que no existe, no', 'ok', v_txt = '23514', 'detalle', v_txt);

  -- ── Asignar el rol ───────────────────────────────────────────────────────
  perform public.asignar_empresas_usuario(v_vend, jsonb_build_array(jsonb_build_object('empresa_id', v_emp, 'rol', 'encargado')));
  select rol into v_txt from public.usuario_empresa where usuario_id = v_vend and empresa_id = v_emp;
  r := r || jsonb_build_object('prueba', 'el superadmin asigna el rol Encargado', 'ok', v_txt = 'encargado', 'detalle', v_txt);
  perform pg_temp.como(v_vend);
  r := r || jsonb_build_object('prueba', 'al pasar a Encargado pierde el acceso de oficina de inmediato',
         'ok', not public.tiene_acceso_empresa(v_emp) and public.tiene_acceso_cantera(v_emp), 'detalle', '');
  select count(*) into v_n from public.ventas where empresa_id = v_emp;
  r := r || jsonb_build_object('prueba', 'y deja de ver las ventas', 'ok', v_n = 0, 'detalle', v_n::text);
  perform pg_temp.como(v_super);
  v_txt := pg_temp.falla(format($f$select public.asignar_empresas_usuario(%L, '[{"empresa_id":%s,"rol":"jefe"}]')$f$, v_vend, to_json(v_emp)));
  r := r || jsonb_build_object('prueba', 'un rol que no existe, no', 'ok', v_txt = '22023', 'detalle', v_txt);

  -- Cuenta desactivada: tampoco en la cantera
  reset role;
  update public.profiles set activo = false where id = v_enc2;
  perform pg_temp.como(v_enc2);
  r := r || jsonb_build_object('prueba', 'cuenta desactivada: sin acceso a la cantera', 'ok', not public.tiene_acceso_cantera(v_emp), 'detalle', '');

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
