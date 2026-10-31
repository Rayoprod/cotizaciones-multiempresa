-- Pruebas de ventas y pagos (20261030060000).
-- Simula a un vendedor y a un admin reales sin iniciar sesión.
-- Todo corre en una transacción que se deshace al final: no modifica nada.
--
-- Uso: supabase db query --linked -f supabase/pruebas_ventas.sql

begin;

do $$
declare
  r         jsonb := '[]'::jsonb;
  v_vend    uuid;
  v_emp     text;
  v_ajena   text;
  v_hoy     date := (now() at time zone 'America/Lima')::date;
  v_cliente constant jsonb := '{"nombre":"CLIENTE DE PRUEBA SAC","documento":"20999999991","telefono":"999 888 777"}';
  v_item    constant jsonb := '[{"descripcion":"Ítem de prueba","cantidad":10,"precio_unitario":100}]';
  v_sku     text;
  v         jsonb;
  w         jsonb;
  v_id      uuid;
  v_pago    uuid;
  v_cot     public.cotizaciones;
  v_n       int;
  v_estado  text;
  v_sec     int;
  v_comp    uuid;
  v_otra    uuid;
begin
  -- ── Contexto (como postgres) ─────────────────────────────────────────────
  select p.id, ue.empresa_id into v_vend, v_emp
    from public.profiles p
    join public.usuario_empresa ue on ue.usuario_id = p.id and ue.activo and ue.rol = 'vendedor'
   where p.rol = 'usuario' and p.activo
     and (select count(*) from public.usuario_empresa u where u.usuario_id = p.id and u.activo) = 1
   limit 1;
  if v_vend is null then
    raise exception 'No hay un vendedor activo con exactamente una empresa para probar.';
  end if;
  select id into v_ajena from public.empresas where id <> v_emp order by id limit 1;
  update public.empresas set lugares_entrega = array['PUESTO EN OBRA', 'PUESTO EN CANTERA'] where id = v_emp;
  update public.profiles set nombre = 'Vendedora Prueba' where id = v_vend;
  insert into public.productos (codigo_sku, descripcion, unidad, precio_unitario_base, empresa_id)
  values ('PRD-PRUEBA', 'Arena de prueba', 'm3', 50, v_emp);
  select secuencia into v_sec from public.folios_empresas where empresa_codigo = v_emp;

  -- ── Como vendedor ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Venta directa
  v := public.crear_venta(v_emp, v_cliente,
    '[{"sku":"PRD-PRUEBA","descripcion":" Arena de prueba ","cantidad":2.5,"precio_unitario":16,"subtotal":1},
      {"descripcion":"Flete","cantidad":3,"precio_unitario":33.333}]');
  r := r || jsonb_build_object('prueba', 'totales calculados por el servidor (140 + 25.20 = 165.20)',
         'ok', (v->>'subtotal')::numeric = 140 and (v->>'igv')::numeric = 25.20 and (v->>'total')::numeric = 165.20,
         'detalle', format('%s + %s = %s', v->>'subtotal', v->>'igv', v->>'total'));
  r := r || jsonb_build_object('prueba', 'folio de venta con su propia serie', 'ok', v->>'folio' ~ '-V-\d{8}$', 'detalle', v->>'folio');
  select secuencia into v_n from public.folios_empresas where empresa_codigo = v_emp;
  r := r || jsonb_build_object('prueba', 'no consume folios de cotización', 'ok', v_n is not distinct from v_sec, 'detalle', coalesce(v_n::text, 'sin contador'));
  r := r || jsonb_build_object('prueba', 'nace activa, por entregar y con fecha de hoy',
         'ok', v->>'estado' = 'ACTIVA' and v->>'estado_entrega' = 'PENDIENTE' and (v->>'fecha')::date = v_hoy and v->>'creado_por' = v_vend::text,
         'detalle', v->>'fecha');
  r := r || jsonb_build_object('prueba', 'copia el nombre y el correo del vendedor',
         'ok', v->>'vendedor_nombre' = 'Vendedora Prueba' and v->>'vendedor' like '%@%', 'detalle', v->>'vendedor_nombre');
  r := r || jsonb_build_object('prueba', 'línea ligada al producto por código, con su unidad, recortada y con importe del servidor',
         'ok', v->'venta_items'->0->>'producto_id' is not null and v->'venta_items'->0->>'descripcion' = 'Arena de prueba'
               and v->'venta_items'->0->>'unidad' = 'm3'
               and (v->'venta_items'->0->>'importe')::numeric = 40 and (v->'venta_items'->1->>'importe')::numeric = 100,
         'detalle', v->'venta_items'->0->>'importe');
  r := r || jsonb_build_object('prueba', 'línea libre sin producto: lleva la unidad que más usa la empresa',
         'ok', v->'venta_items'->1->>'producto_id' is null
               and v->'venta_items'->1->>'unidad' = (select p.unidad from public.productos p where p.empresa_id = v_emp and nullif(btrim(p.unidad), '') is not null group by p.unidad order by count(*) desc, p.unidad limit 1),
         'detalle', v->'venta_items'->1->>'unidad');
  select count(*) into v_n from public.clientes where id = (v->>'cliente_id')::uuid and empresa_id = v_emp;
  r := r || jsonb_build_object('prueba', 'cliente guardado en la cartera', 'ok', v_n = 1, 'detalle', v->>'cliente_id');
  r := r || jsonb_build_object('prueba', 'saldo igual al total sin pagos', 'ok', (v->>'saldo')::numeric = 165.20 and (v->>'pagado')::numeric = 0, 'detalle', v->>'saldo');

  -- Modos de IGV y descuento: mismos casos que el frontend
  v := public.crear_venta(v_emp, v_cliente, v_item, true, true, 100);
  r := r || jsonb_build_object('prueba', 'precios con IGV y descuento',
         'ok', (v->>'subtotal')::numeric = 1000 and (v->>'total')::numeric = 900 and (v->>'igv')::numeric = 137.29 and (v->>'precios_con_igv')::boolean,
         'detalle', format('%s, igv %s', v->>'total', v->>'igv'));
  v := public.crear_venta(v_emp, v_cliente, v_item, false, false, 100);
  r := r || jsonb_build_object('prueba', 'sin IGV con descuento', 'ok', (v->>'igv')::numeric = 0 and (v->>'total')::numeric = 900, 'detalle', v->>'total');

  -- Validaciones
  begin
    perform public.crear_venta(v_emp, '{"nombre":"Sin documento"}', v_item);
    r := r || jsonb_build_object('prueba', 'rechaza sin RUC ni DNI', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza sin RUC ni DNI', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_venta(v_emp, '{"nombre":"Mal documento","documento":"123"}', v_item);
    r := r || jsonb_build_object('prueba', 'rechaza un documento que no es RUC ni DNI', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un documento que no es RUC ni DNI', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_venta(v_emp, v_cliente, '[]');
    r := r || jsonb_build_object('prueba', 'rechaza sin ítems', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza sin ítems', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item, p_fecha => v_hoy + 1);
    r := r || jsonb_build_object('prueba', 'rechaza fecha futura', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza fecha futura', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item, p_lugar_entrega => 'EN LA LUNA');
    r := r || jsonb_build_object('prueba', 'rechaza un lugar que no es de la empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un lugar que no es de la empresa', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item, p_descuento => 2000);
    r := r || jsonb_build_object('prueba', 'rechaza descuento mayor al subtotal', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza descuento mayor al subtotal', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.crear_venta(v_ajena, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'rechaza empresa ajena', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza empresa ajena', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  -- Fecha anterior y crédito
  v := public.crear_venta(v_emp, v_cliente, v_item, p_condicion_pago => 'CREDITO', p_dias_credito => 30, p_fecha => v_hoy - 40);
  r := r || jsonb_build_object('prueba', 'fecha anterior: el vencimiento cuenta desde esa fecha y queda cuándo se registró',
         'ok', (v->>'fecha')::date = v_hoy - 40 and (v->>'vence_el')::date = v_hoy - 10 and (v->>'registrada_en')::timestamptz > now() - interval '1 minute',
         'detalle', v->>'vence_el');
  v := public.crear_venta(v_emp, v_cliente, v_item, p_condicion_pago => 'CREDITO');
  r := r || jsonb_build_object('prueba', 'crédito sin fecha fija de vencimiento', 'ok', v->>'vence_el' is null and v->>'condicion_pago' = 'CREDITO', 'detalle', coalesce(v->>'vence_el', 'sin fecha'));
  v := public.crear_venta(v_emp, v_cliente, v_item, p_dias_credito => 30);
  r := r || jsonb_build_object('prueba', 'contado no guarda días de crédito', 'ok', v->>'dias_credito' is null and v->>'vence_el' is null, 'detalle', v->>'condicion_pago');
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item, p_condicion_pago => 'CREDITO', p_dias_credito => 0);
    r := r || jsonb_build_object('prueba', 'rechaza 0 días de crédito', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza 0 días de crédito', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;

  -- Entrega al registrar
  v := public.crear_venta(v_emp, v_cliente, v_item, p_estado_entrega => 'ENTREGADA', p_fecha => v_hoy - 90);
  r := r || jsonb_build_object('prueba', 'una deuda antigua se registra ya entregada', 'ok', v->>'estado_entrega' = 'ENTREGADA' and (v->>'fecha')::date = v_hoy - 90, 'detalle', v->>'estado_entrega');
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item, p_estado_entrega => 'PERDIDA');
    r := r || jsonb_build_object('prueba', 'rechaza una entrega inicial desconocida', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza una entrega inicial desconocida', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;

  -- Adelanto
  v := public.crear_venta(v_emp, v_cliente, v_item, p_condicion_pago => 'CREDITO',
         p_adelanto => '{"monto":300,"metodo":"TRANSFERENCIA","referencia":"OP-123"}');
  r := r || jsonb_build_object('prueba', 'adelanto al vender: queda el pago y baja el saldo',
         'ok', (v->>'pagado')::numeric = 300 and (v->>'saldo')::numeric = 880 and jsonb_array_length(v->'pagos') = 1
               and v->'pagos'->0->>'referencia' = 'OP-123' and v->'pagos'->0->>'creado_por_nombre' = 'Vendedora Prueba',
         'detalle', v->>'saldo');
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item, p_adelanto => '{"monto":5000,"metodo":"EFECTIVO"}');
    r := r || jsonb_build_object('prueba', 'rechaza adelanto mayor al total, sin guardar nada', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza adelanto mayor al total, sin guardar nada', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;

  -- Pagos parciales
  v_id := (v->>'id')::uuid;
  v := public.registrar_pago(v_id, 400, 'EFECTIVO');
  r := r || jsonb_build_object('prueba', 'pago parcial suma a lo pagado', 'ok', (v->>'pagado')::numeric = 700 and (v->>'saldo')::numeric = 480, 'detalle', v->>'saldo');
  v_pago := (v->'pagos'->1->>'id')::uuid;
  begin
    perform public.registrar_pago(v_id, 480.01, 'EFECTIVO');
    r := r || jsonb_build_object('prueba', 'rechaza pago mayor al saldo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza pago mayor al saldo', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.registrar_pago(v_id, 0, 'EFECTIVO');
    r := r || jsonb_build_object('prueba', 'rechaza pago de 0', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza pago de 0', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.registrar_pago(v_id, 10, 'TRUEQUE');
    r := r || jsonb_build_object('prueba', 'rechaza un método desconocido', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un método desconocido', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.registrar_pago(v_id, 10, 'EFECTIVO', v_hoy + 1);
    r := r || jsonb_build_object('prueba', 'rechaza pago con fecha futura', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza pago con fecha futura', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;

  -- Lo que un vendedor sí y no puede
  v := public.marcar_entrega_venta(v_id, 'PARCIAL');
  r := r || jsonb_build_object('prueba', 'vendedor marca la entrega y queda en el historial',
         'ok', v->>'estado_entrega' = 'PARCIAL' and v->'venta_cambios'->0->>'tipo' = 'ENTREGA', 'detalle', v->>'estado_entrega');
  begin
    perform public.marcar_entrega_venta(v_id, 'PERDIDA');
    r := r || jsonb_build_object('prueba', 'rechaza un estado de entrega desconocido', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un estado de entrega desconocido', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;

  -- Facturas y boletas: una venta admite varias
  v := public.agregar_comprobante_venta(v_id, 'FACTURA', ' f001-123 ', 300);
  r := r || jsonb_build_object('prueba', 'vendedor agrega la factura de un adelanto',
         'ok', jsonb_array_length(v->'venta_comprobantes') = 1 and v->'venta_comprobantes'->0->>'numero' = 'F001-123'
               and (v->'venta_comprobantes'->0->>'monto')::numeric = 300 and (v->'venta_comprobantes'->0->>'fecha')::date = v_hoy
               and v->'venta_comprobantes'->0->>'creado_por_nombre' = 'Vendedora Prueba' and not (v->'venta_comprobantes'->0->>'anulado')::boolean,
         'detalle', v->'venta_comprobantes'->0->>'numero');
  v_comp := (v->'venta_comprobantes'->0->>'id')::uuid;
  v := public.agregar_comprobante_venta(v_id, 'BOLETA', 'B001-7', 400, v_hoy - 1);
  r := r || jsonb_build_object('prueba', 'una venta admite varias, cada una con su fecha',
         'ok', jsonb_array_length(v->'venta_comprobantes') = 2 and v->'venta_comprobantes'->0->>'numero' = 'B001-7' and (v->'venta_comprobantes'->0->>'fecha')::date = v_hoy - 1,
         'detalle', jsonb_array_length(v->'venta_comprobantes') || ' comprobantes');
  begin
    perform public.agregar_comprobante_venta(v_id, 'FACTURA', 'f001-123', 10);
    r := r || jsonb_build_object('prueba', 'rechaza repetir un número en la misma venta', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza repetir un número en la misma venta', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.agregar_comprobante_venta(v_id, 'RECIBO', 'R-1', 10);
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante que no es factura ni boleta', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante que no es factura ni boleta', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.agregar_comprobante_venta(v_id, 'FACTURA', '   ', 10);
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante sin número', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante sin número', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.agregar_comprobante_venta(v_id, 'FACTURA', 'F001-9', 0);
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante sin monto', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante sin monto', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.agregar_comprobante_venta(v_id, 'FACTURA', 'F001-9', 10, v_hoy + 1);
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante con fecha futura', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza un comprobante con fecha futura', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  w := public.crear_venta(v_emp, v_cliente, v_item, false);
  v_otra := (w->>'id')::uuid;
  w := public.agregar_comprobante_venta(v_otra, 'FACTURA', 'F001-123', 99999);
  r := r || jsonb_build_object('prueba', 'el mismo número se acepta en otra venta, y facturar de más no se bloquea',
         'ok', (w->'venta_comprobantes'->0->>'monto')::numeric = 99999 and (w->>'total')::numeric = 1000, 'detalle', w->'venta_comprobantes'->0->>'monto');

  -- El archivo: bucket privado, carpeta de la empresa y de la venta
  begin
    perform public.adjuntar_archivo_comprobante(v_comp, v_emp || '/' || v_id || '/no-existe.pdf', 'x.pdf');
    r := r || jsonb_build_object('prueba', 'no liga un archivo que no se subió', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no liga un archivo que no se subió', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  insert into storage.objects (bucket_id, name) values ('comprobantes', v_emp || '/' || v_id || '/f001-123.pdf');
  insert into storage.objects (bucket_id, name) values ('comprobantes', v_emp || '/' || v_otra || '/de-otra-venta.pdf');
  select count(*) into v_n from storage.objects where bucket_id = 'comprobantes' and name like v_emp || '/%';
  r := r || jsonb_build_object('prueba', 'el vendedor sube y ve archivos en la carpeta de su empresa', 'ok', v_n = 2, 'detalle', v_n || ' archivos');
  begin
    perform public.adjuntar_archivo_comprobante(v_comp, v_emp || '/' || v_otra || '/de-otra-venta.pdf', 'x.pdf');
    r := r || jsonb_build_object('prueba', 'no liga el archivo de otra venta', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no liga el archivo de otra venta', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  v := public.adjuntar_archivo_comprobante(v_comp, v_emp || '/' || v_id || '/f001-123.pdf', ' Factura 123.pdf ');
  r := r || jsonb_build_object('prueba', 'liga el archivo subido y guarda su nombre',
         'ok', exists (select 1 from jsonb_array_elements(v->'venta_comprobantes') c where c->>'id' = v_comp::text and c->>'archivo_ruta' like '%/f001-123.pdf' and c->>'archivo_nombre' = 'Factura 123.pdf'),
         'detalle', v_comp::text);
  begin
    perform public.adjuntar_archivo_comprobante(v_comp, v_emp || '/' || v_id || '/f001-123.pdf', 'otro.pdf');
    r := r || jsonb_build_object('prueba', 'un archivo ligado no se reemplaza', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'un archivo ligado no se reemplaza', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  update storage.objects set name = name || '.cambiado' where bucket_id = 'comprobantes' and name like v_emp || '/%';
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('prueba', 'nadie cambia un archivo subido', 'ok', v_n = 0, 'detalle', v_n || ' filas');
  begin
    delete from storage.objects where bucket_id = 'comprobantes' and name like v_emp || '/%';
    get diagnostics v_n = row_count;
    r := r || jsonb_build_object('prueba', 'nadie borra un archivo subido', 'ok', v_n = 0, 'detalle', v_n || ' filas');
  exception when others then
    r := r || jsonb_build_object('prueba', 'nadie borra un archivo subido', 'ok', true, 'detalle', sqlerrm);
  end;
  begin
    perform public.anular_comprobante_venta(v_comp, 'error');
    r := r || jsonb_build_object('prueba', 'un vendedor no anula facturas', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'un vendedor no anula facturas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    insert into public.venta_comprobantes (venta_id, empresa_id, tipo, numero, fecha, monto) values (v_id, v_emp, 'FACTURA', 'F-DIRECTA', v_hoy, 1);
    r := r || jsonb_build_object('prueba', 'insert directo de factura bloqueado', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'insert directo de factura bloqueado', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    update public.venta_comprobantes set monto = 1 where id = v_comp;
    r := r || jsonb_build_object('prueba', 'no se puede cambiar una factura directamente', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no se puede cambiar una factura directamente', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.anular_pago(v_pago, 'error');
    r := r || jsonb_build_object('prueba', 'un vendedor no anula pagos', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'un vendedor no anula pagos', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.anular_venta(v_id, 'error');
    r := r || jsonb_build_object('prueba', 'un vendedor no anula ventas', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'un vendedor no anula ventas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.ajustar_venta(v_id, v_item, true, false, 0, null, null, 'CONTADO', null, 'error');
    r := r || jsonb_build_object('prueba', 'un vendedor no ajusta ventas', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'un vendedor no ajusta ventas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  -- Escritura directa bloqueada
  begin
    insert into public.ventas (folio, fecha, empresa_id, cliente_nombre, cliente_documento, subtotal, igv, total, incluye_igv)
    values ('FALSO-1', v_hoy, v_emp, 'x', '12345678', 0, 0, 0, false);
    r := r || jsonb_build_object('prueba', 'insert directo de venta bloqueado', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'insert directo de venta bloqueado', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    update public.ventas set total = 1 where id = v_id;
    r := r || jsonb_build_object('prueba', 'no se puede cambiar el total directamente', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no se puede cambiar el total directamente', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    delete from public.ventas where id = v_id;
    r := r || jsonb_build_object('prueba', 'no se puede borrar una venta', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no se puede borrar una venta', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    insert into public.pagos (venta_id, empresa_id, fecha, monto, metodo) values (v_id, v_emp, v_hoy, 1, 'EFECTIVO');
    r := r || jsonb_build_object('prueba', 'insert directo de pago bloqueado', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'insert directo de pago bloqueado', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    update public.folios_documentos set secuencia = 0 where empresa_id = v_emp;
    r := r || jsonb_build_object('prueba', 'contador de ventas intocable', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'contador de ventas intocable', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.insertar_pago(null::public.ventas, 1, 'EFECTIVO', null, null, null);
    r := r || jsonb_build_object('prueba', 'las funciones internas no se pueden llamar', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'las funciones internas no se pueden llamar', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  -- Cotización → venta
  v_cot := public.crear_cotizacion(v_emp, v_cliente, v_item, true, 'PUESTO EN OBRA', 'Nota de la cotización',
             '{"diasValidez":30,"mostrarCuentas":false,"mostrarContacto":true}', p_descuento => 50);
  w := public.convertir_cotizacion_en_venta(v_cot.id, 'CREDITO', 15, null, '{"monto":100,"metodo":"DEPOSITO"}');
  select estado into v_estado from public.cotizaciones where id = v_cot.id;
  r := r || jsonb_build_object('prueba', 'convertir copia lo cotizado y aprueba en un solo paso',
         'ok', v_estado = 'APROBADA' and w->>'cotizacion_id' = v_cot.id::text and w->>'folio_cotizacion' = v_cot.folio
               and (w->>'total')::numeric = v_cot.total and (w->>'descuento_global')::numeric = 50
               and w->>'lugar_entrega' = 'PUESTO EN OBRA' and w->>'observaciones' = 'Nota de la cotización'
               and (w->>'pagado')::numeric = 100 and (w->'condiciones'->>'mostrarCuentas')::boolean = false,
         'detalle', v_estado || ' → ' || (w->>'folio'));
  begin
    perform public.convertir_cotizacion_en_venta(v_cot.id);
    r := r || jsonb_build_object('prueba', 'una cotización no se vende dos veces', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una cotización no se vende dos veces', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  begin
    update public.cotizaciones set estado = 'PENDIENTE' where id = v_cot.id;
    r := r || jsonb_build_object('prueba', 'con venta activa la cotización no vuelve a Pendiente', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'con venta activa la cotización no vuelve a Pendiente', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  begin
    update public.cotizaciones set estado = 'ANULADA' where id = v_cot.id;
    r := r || jsonb_build_object('prueba', 'con venta activa la cotización no se anula', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'con venta activa la cotización no se anula', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;

  -- Cotización ya aprobada sin venta (las antiguas): se puede registrar
  v_cot := public.crear_cotizacion(v_emp, v_cliente, v_item);
  update public.cotizaciones set estado = 'APROBADA' where id = v_cot.id;
  v := public.convertir_cotizacion_en_venta(v_cot.id);
  select estado into v_estado from public.cotizaciones where id = v_cot.id;
  r := r || jsonb_build_object('prueba', 'una Aprobada sin venta se puede registrar', 'ok', v_estado = 'APROBADA' and v->>'cotizacion_id' = v_cot.id::text, 'detalle', v->>'folio');

  v_cot := public.crear_cotizacion(v_emp, v_cliente, v_item);
  update public.cotizaciones set estado = 'ANULADA' where id = v_cot.id;
  begin
    perform public.convertir_cotizacion_en_venta(v_cot.id);
    r := r || jsonb_build_object('prueba', 'una Anulada no se convierte', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una Anulada no se convierte', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;

  v_cot := public.crear_cotizacion(v_emp, '{"nombre":"Sin documento real","documento":"1"}', v_item);
  begin
    perform public.convertir_cotizacion_en_venta(v_cot.id);
    r := r || jsonb_build_object('prueba', 'una cotización sin RUC ni DNI válido no se convierte', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una cotización sin RUC ni DNI válido no se convierte', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  select estado into v_estado from public.cotizaciones where id = v_cot.id;
  r := r || jsonb_build_object('prueba', 'si la conversión falla, la cotización sigue Pendiente', 'ok', v_estado = 'PENDIENTE', 'detalle', v_estado);
  w := public.convertir_cotizacion_en_venta(v_cot.id, p_documento => '20999999992', p_estado_entrega => 'PARCIAL');
  select count(*) into v_n from public.clientes where empresa_id = v_emp and documento_identidad = '20999999992' and nombre_razon_social = 'Sin documento real';
  r := r || jsonb_build_object('prueba', 'al convertir se completa el RUC o DNI y queda en la cartera',
         'ok', w->>'cliente_documento' = '20999999992' and w->>'estado_entrega' = 'PARCIAL' and w->>'cliente_id' is not null and v_n = 1,
         'detalle', w->>'cliente_documento');

  -- Convertir no pisa los datos del cliente con los de una cotización vieja
  v_cot := public.crear_cotizacion(v_emp, '{"nombre":"Nombre viejo SAC","documento":"20999999993"}', v_item);
  perform public.crear_venta(v_emp, '{"nombre":"Nombre corregido SAC","documento":"20999999993"}', v_item);
  w := public.convertir_cotizacion_en_venta(v_cot.id);
  select nombre_razon_social into v_estado from public.clientes where empresa_id = v_emp and documento_identidad = '20999999993';
  r := r || jsonb_build_object('prueba', 'convertir no pisa los datos del cliente en la cartera',
         'ok', v_estado = 'Nombre corregido SAC' and w->>'cliente_nombre' = 'Nombre viejo SAC' and w->>'cliente_id' is not null,
         'detalle', v_estado);

  -- ── Como admin de la empresa ─────────────────────────────────────────────
  reset role;
  update public.usuario_empresa set rol = 'admin' where usuario_id = v_vend and empresa_id = v_emp;
  set local role authenticated;

  -- Anular pagos
  begin
    perform public.anular_pago(v_pago, '   ');
    r := r || jsonb_build_object('prueba', 'anular un pago exige motivo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anular un pago exige motivo', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  v := public.anular_pago(v_pago, 'Se registró dos veces');
  r := r || jsonb_build_object('prueba', 'al anular un pago vuelve el saldo y queda el rastro',
         'ok', (v->>'pagado')::numeric = 300 and (v->>'saldo')::numeric = 880 and (v->'pagos'->1->>'anulado')::boolean
               and v->'pagos'->1->>'motivo_anulacion' = 'Se registró dos veces' and v->'venta_cambios'->0->>'tipo' = 'PAGO_ANULADO',
         'detalle', v->>'saldo');
  begin
    perform public.anular_pago(v_pago, 'otra vez');
    r := r || jsonb_build_object('prueba', 'un pago no se anula dos veces', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'un pago no se anula dos veces', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;

  -- Anular una factura
  begin
    perform public.anular_comprobante_venta(v_comp, ' ');
    r := r || jsonb_build_object('prueba', 'anular una factura exige motivo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anular una factura exige motivo', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  v := public.anular_comprobante_venta(v_comp, 'Se emitió mal');
  r := r || jsonb_build_object('prueba', 'la factura anulada se queda, con archivo y rastro',
         'ok', exists (select 1 from jsonb_array_elements(v->'venta_comprobantes') c where c->>'id' = v_comp::text and (c->>'anulado')::boolean and c->>'motivo_anulacion' = 'Se emitió mal' and c->>'archivo_ruta' is not null)
               and v->'venta_cambios'->0->>'tipo' = 'COMPROBANTE_ANULADO' and v->'venta_cambios'->0->'detalle'->>'numero' = 'F001-123',
         'detalle', v->'venta_cambios'->0->>'tipo');
  begin
    perform public.anular_comprobante_venta(v_comp, 'otra vez');
    r := r || jsonb_build_object('prueba', 'una factura no se anula dos veces', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una factura no se anula dos veces', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  begin
    perform public.adjuntar_archivo_comprobante(v_comp, v_emp || '/' || v_id || '/f001-123.pdf', 'x.pdf');
    r := r || jsonb_build_object('prueba', 'una factura anulada no recibe archivo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una factura anulada no recibe archivo', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  v := public.agregar_comprobante_venta(v_id, 'FACTURA', 'F001-123', 300);
  r := r || jsonb_build_object('prueba', 'anulada, su número se puede volver a usar', 'ok', jsonb_array_length(v->'venta_comprobantes') = 3, 'detalle', jsonb_array_length(v->'venta_comprobantes') || ' comprobantes');

  -- Ajustar
  begin
    perform public.ajustar_venta(v_id, v_item, true, false, 0, null, null, 'CONTADO', null, '');
    r := r || jsonb_build_object('prueba', 'ajustar exige motivo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'ajustar exige motivo', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  w := public.ajustar_venta(v_id,
         jsonb_build_array(
           jsonb_build_object('id', v->'venta_items'->0->>'id', 'descripcion', 'Ítem de prueba', 'cantidad', 20, 'precio_unitario', 110, 'unidad', 'm3'),
           jsonb_build_object('descripcion', 'Línea nueva', 'cantidad', 1, 'precio_unitario', 50, 'unidad', 'viaje')
         ),
         false, false, 50, 'PUESTO EN CANTERA', 'Se amplió', 'CREDITO', 45, 'El cliente pidió más');
  r := r || jsonb_build_object('prueba', 'ajustar cambia líneas y totales sin cambiar el folio',
         'ok', w->>'folio' = v->>'folio' and (w->>'subtotal')::numeric = 2250 and (w->>'total')::numeric = 2200
               and (w->>'pagado')::numeric = 300 and (w->>'saldo')::numeric = 1900 and jsonb_array_length(w->'venta_items') = 2,
         'detalle', format('%s, saldo %s', w->>'total', w->>'saldo'));
  r := r || jsonb_build_object('prueba', 'la línea que sigue conserva su identidad',
         'ok', w->'venta_items'->0->>'id' = v->'venta_items'->0->>'id' and (w->'venta_items'->0->>'cantidad')::numeric = 20,
         'detalle', w->'venta_items'->0->>'id');
  r := r || jsonb_build_object('prueba', 'el ajuste guarda cómo estaba antes',
         'ok', w->'venta_cambios'->0->>'tipo' = 'AJUSTE' and w->'venta_cambios'->0->>'motivo' = 'El cliente pidió más'
               and (w->'venta_cambios'->0->'detalle'->'antes'->>'total')::numeric = 1180
               and (w->'venta_cambios'->0->'detalle'->'despues'->>'total')::numeric = 2200,
         'detalle', w->'venta_cambios'->0->'detalle'->'antes'->>'total');
  r := r || jsonb_build_object('prueba', 'el ajuste recalcula el vencimiento desde la fecha de la venta',
         'ok', (w->>'vence_el')::date = (w->>'fecha')::date + 45, 'detalle', w->>'vence_el');
  v := public.ajustar_venta(v_id, w->'venta_items', false, false, 50, 'PUESTO EN CANTERA', 'Se amplió', 'CREDITO', 30, 'Fecha mal escrita', v_hoy - 5);
  r := r || jsonb_build_object('prueba', 'el ajuste corrige la fecha y con ella el vencimiento',
         'ok', (v->>'fecha')::date = v_hoy - 5 and (v->>'vence_el')::date = v_hoy + 25, 'detalle', v->>'vence_el');
  begin
    perform public.ajustar_venta(v_id, w->'venta_items', false, false, 50, null, null, 'CREDITO', 30, 'futuro', v_hoy + 1);
    r := r || jsonb_build_object('prueba', 'el ajuste rechaza una fecha futura', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'el ajuste rechaza una fecha futura', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  begin
    perform public.ajustar_venta(v_id, '[{"descripcion":"Poco","cantidad":1,"precio_unitario":10}]', false, false, 0, null, null, 'CONTADO', null, 'bajar');
    r := r || jsonb_build_object('prueba', 'el total no puede quedar por debajo de lo pagado', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'el total no puede quedar por debajo de lo pagado', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;

  -- Anular venta
  begin
    perform public.anular_venta(v_id, 'error');
    r := r || jsonb_build_object('prueba', 'con pagos vigentes no se anula', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'con pagos vigentes no se anula', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  v_pago := (w->'pagos'->0->>'id')::uuid;
  perform public.anular_pago(v_pago, 'Devolución');
  begin
    perform public.anular_venta(v_id, ' ');
    r := r || jsonb_build_object('prueba', 'anular exige motivo', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anular exige motivo', 'ok', sqlstate = '22023', 'detalle', sqlerrm);
  end;
  v := public.anular_venta(v_id, 'El cliente desistió');
  r := r || jsonb_build_object('prueba', 'venta anulada con rastro',
         'ok', v->>'estado' = 'ANULADA' and v->>'motivo_anulacion' = 'El cliente desistió' and v->>'anulada_por' = v_vend::text, 'detalle', v->>'estado');
  begin
    perform public.registrar_pago(v_id, 10, 'EFECTIVO');
    r := r || jsonb_build_object('prueba', 'una venta anulada no recibe pagos', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una venta anulada no recibe pagos', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  begin
    perform public.ajustar_venta(v_id, v_item, true, false, 0, null, null, 'CONTADO', null, 'revivir');
    r := r || jsonb_build_object('prueba', 'una venta anulada no se ajusta', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una venta anulada no se ajusta', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;
  begin
    perform public.agregar_comprobante_venta(v_id, 'FACTURA', 'F001-200', 10);
    r := r || jsonb_build_object('prueba', 'una venta anulada no recibe facturas', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'una venta anulada no recibe facturas', 'ok', sqlstate = 'P0001', 'detalle', sqlerrm);
  end;

  -- Anular la venta reabre la cotización
  v_cot := public.crear_cotizacion(v_emp, v_cliente, v_item);
  v := public.convertir_cotizacion_en_venta(v_cot.id);
  perform public.anular_venta((v->>'id')::uuid, 'No se concretó');
  select estado into v_estado from public.cotizaciones where id = v_cot.id;
  r := r || jsonb_build_object('prueba', 'al anular la venta, su cotización vuelve a Pendiente', 'ok', v_estado = 'PENDIENTE', 'detalle', v_estado);
  v := public.convertir_cotizacion_en_venta(v_cot.id);
  r := r || jsonb_build_object('prueba', 'y se puede volver a convertir', 'ok', v->>'estado' = 'ACTIVA', 'detalle', v->>'folio');

  reset role;
  update public.usuario_empresa set rol = 'vendedor' where usuario_id = v_vend and empresa_id = v_emp;
  set local role authenticated;

  -- ── Aislamiento entre empresas ───────────────────────────────────────────
  reset role;
  insert into public.ventas (id, folio, fecha, empresa_id, cliente_nombre, cliente_documento, subtotal, igv, total, incluye_igv)
  values ('00000000-0000-4000-8000-0000000000aa', 'AJENA-1', v_hoy, v_ajena, 'Otro cliente', '12345678', 100, 0, 100, false);
  insert into public.pagos (id, venta_id, empresa_id, fecha, monto, metodo)
  values ('00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000aa', v_ajena, v_hoy, 10, 'EFECTIVO');
  insert into public.venta_comprobantes (id, venta_id, empresa_id, tipo, numero, fecha, monto)
  values ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000aa', v_ajena, 'FACTURA', 'F001-1', v_hoy, 10);
  insert into storage.objects (bucket_id, name) values ('comprobantes', v_ajena || '/00000000-0000-4000-8000-0000000000aa/ajena.pdf');
  v_cot := null;
  insert into public.cotizaciones (folio, empresa_id, cliente_nombre, cliente_documento, subtotal, igv, total, items)
  values ('AJENA-COT-1', v_ajena, 'Otro cliente', '12345678', 100, 0, 100, '[{"descripcion":"x","cantidad":1,"precio_unitario":100}]')
  returning * into v_cot;
  set local role authenticated;

  select count(*) into v_n from public.ventas where empresa_id = v_ajena;
  r := r || jsonb_build_object('prueba', 'no ve ventas de otra empresa', 'ok', v_n = 0, 'detalle', v_n || ' filas');
  select count(*) into v_n from public.pagos where empresa_id = v_ajena;
  r := r || jsonb_build_object('prueba', 'no ve pagos de otra empresa', 'ok', v_n = 0, 'detalle', v_n || ' filas');
  begin
    perform public.registrar_pago('00000000-0000-4000-8000-0000000000aa', 1, 'EFECTIVO');
    r := r || jsonb_build_object('prueba', 'no paga ventas de otra empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no paga ventas de otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.anular_pago('00000000-0000-4000-8000-0000000000ab', 'x');
    r := r || jsonb_build_object('prueba', 'no anula pagos de otra empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no anula pagos de otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.marcar_entrega_venta('00000000-0000-4000-8000-0000000000aa', 'ENTREGADA');
    r := r || jsonb_build_object('prueba', 'no marca entregas de otra empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no marca entregas de otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  select count(*) into v_n from public.venta_comprobantes where empresa_id = v_ajena;
  r := r || jsonb_build_object('prueba', 'no ve facturas de otra empresa', 'ok', v_n = 0, 'detalle', v_n || ' filas');
  select count(*) into v_n from storage.objects where bucket_id = 'comprobantes' and name like v_ajena || '/%';
  r := r || jsonb_build_object('prueba', 'no ve archivos de otra empresa', 'ok', v_n = 0, 'detalle', v_n || ' archivos');
  begin
    insert into storage.objects (bucket_id, name) values ('comprobantes', v_ajena || '/x/intruso.pdf');
    r := r || jsonb_build_object('prueba', 'no sube archivos a otra empresa', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no sube archivos a otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.agregar_comprobante_venta('00000000-0000-4000-8000-0000000000aa', 'FACTURA', 'F001-2', 1);
    r := r || jsonb_build_object('prueba', 'no agrega facturas a otra empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no agrega facturas a otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.adjuntar_archivo_comprobante('00000000-0000-4000-8000-0000000000ac', v_ajena || '/00000000-0000-4000-8000-0000000000aa/ajena.pdf', 'x.pdf');
    r := r || jsonb_build_object('prueba', 'no liga archivos en otra empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no liga archivos en otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.anular_comprobante_venta('00000000-0000-4000-8000-0000000000ac', 'x');
    r := r || jsonb_build_object('prueba', 'no anula facturas de otra empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no anula facturas de otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform public.convertir_cotizacion_en_venta(v_cot.id);
    r := r || jsonb_build_object('prueba', 'no convierte cotizaciones de otra empresa', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'no convierte cotizaciones de otra empresa', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  -- ── Sin sesión, anónimo y usuario desactivado ────────────────────────────
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'rechaza sin sesión', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'rechaza sin sesión', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  reset role;
  set local role anon;
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'anónimo no puede ejecutarla', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anónimo no puede ejecutarla', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform 1 from public.ventas limit 1;
    r := r || jsonb_build_object('prueba', 'anónimo no lee ventas', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anónimo no lee ventas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    perform 1 from public.venta_comprobantes limit 1;
    r := r || jsonb_build_object('prueba', 'anónimo no lee facturas', 'ok', false, 'detalle', 'se pudo');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anónimo no lee facturas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  begin
    select count(*) into v_n from storage.objects where bucket_id = 'comprobantes';
    r := r || jsonb_build_object('prueba', 'anónimo no ve archivos de facturas', 'ok', v_n = 0, 'detalle', v_n || ' archivos');
  exception when others then
    r := r || jsonb_build_object('prueba', 'anónimo no ve archivos de facturas', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;

  reset role;
  update public.profiles set activo = false where id = v_vend;
  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.crear_venta(v_emp, v_cliente, v_item);
    r := r || jsonb_build_object('prueba', 'usuario desactivado no puede', 'ok', false, 'detalle', 'no falló');
  exception when others then
    r := r || jsonb_build_object('prueba', 'usuario desactivado no puede', 'ok', sqlstate = '42501', 'detalle', sqlerrm);
  end;
  reset role;

  select count(*) into v_n from storage.buckets
   where id = 'comprobantes' and not public and file_size_limit = 10485760 and 'application/pdf' = any (allowed_mime_types);
  r := r || jsonb_build_object('prueba', 'el bucket de facturas es privado y limita peso y tipo', 'ok', v_n = 1, 'detalle', v_n || ' bucket');

  perform set_config('pruebas.resultado', r::text, true);
end;
$$;

select json_build_object(
  'total',   jsonb_array_length(current_setting('pruebas.resultado')::jsonb),
  'fallidas', (select count(*) from jsonb_array_elements(current_setting('pruebas.resultado')::jsonb) e where not (e->>'ok')::boolean),
  'detalle', current_setting('pruebas.resultado')::jsonb
) as resultado;

rollback;
