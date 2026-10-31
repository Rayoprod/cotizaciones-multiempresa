import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccionesVentaComponent } from './acciones-venta';
import { CLAVE_BORRADOR_COTIZADOR, IVenta, fechaIso } from '../../models';

const venta = (extra: Partial<IVenta> = {}): IVenta => ({
  id: 'v1', folio: 'WM-V-00000001', fecha: '2026-10-01', empresa_id: 'WM', estado: 'ACTIVA', estado_entrega: 'PENDIENTE',
  cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789', subtotal: 1000, descuento_global: 0, igv: 180, total: 1180,
  incluye_igv: true, precios_con_igv: false, pagado: 0, saldo: 1180, condicion_pago: 'CONTADO',
  venta_items: [{ id: 'linea-1', descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100, importe: 1000 }],
  pagos: [], venta_comprobantes: [], ...extra
});

const conArchivo = (extra: any = {}): any => ({
  id: 'c1', venta_id: 'v1', empresa_id: 'WM', tipo: 'FACTURA', numero: 'F001-1', fecha: '2026-10-01', monto: 500,
  archivo_ruta: 'WM/v1/c1-1.pdf', archivo_nombre: 'f.pdf', registrado_en: '', anulado: false, ...extra
});

describe('AccionesVentaComponent', () => {
  let supabase: any;
  let mensajes: any;
  let router: any;
  let pdf: any;
  let esAdmin: boolean;
  let usaSalidas: boolean;
  let comp: any;
  let actualizadas: IVenta[];
  const etiquetas = (v: IVenta) => comp.menuDe(v).filter((i: any) => !i.separator).map((i: any) => i.label);

  beforeEach(() => {
    const almacen = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { setItem: (k: string, v: string) => almacen.set(k, v), getItem: (k: string) => almacen.get(k) ?? null });
    supabase = {
      getCambiosVenta: vi.fn(async () => [{ id: 'c1', tipo: 'ENTREGA', fecha: '2026-10-02', detalle: {} }]),
      getSalidasDeVenta: vi.fn(async () => [{ id: 's1', placa: 'ABC123', cantidad: 25, unidad: 'm3' }]),
      detenerSalidasVenta: vi.fn(async (_: string, detener: boolean, motivo: string | null) => venta({ salidas_detenidas_en: detener ? '2026-10-02T10:00:00Z' : null, motivo_detencion: motivo })),
      registrarPago: vi.fn(async () => venta({ pagado: 500, saldo: 680 })),
      anularPago: vi.fn(async () => venta()),
      anularVenta: vi.fn(async () => venta({ estado: 'ANULADA' })),
      marcarEntregaVenta: vi.fn(async (_: string, estado: any) => venta({ estado_entrega: estado })),
      agregarComprobanteVenta: vi.fn(async (_: string, c: any) => venta({ venta_comprobantes: [conArchivo({ ...c, id: 'c1', archivo_ruta: null })] })),
      subirArchivoComprobante: vi.fn(async () => 'WM/v1/c1-1.pdf'),
      adjuntarArchivoComprobante: vi.fn(async () => venta({ venta_comprobantes: [conArchivo()] })),
      urlArchivoComprobante: vi.fn(async () => 'https://enlace.temporal/f.pdf'),
      anularComprobanteVenta: vi.fn(async () => venta({ venta_comprobantes: [conArchivo({ anulado: true })] }))
    };
    mensajes = { add: vi.fn() };
    router = { navigate: vi.fn() };
    pdf = { generarYDescargarOrdenVenta: vi.fn(async () => {}) };
    esAdmin = false;
    usaSalidas = false;
    comp = new AccionesVentaComponent(
      supabase, mensajes, pdf, { markForCheck: () => {} } as any, router,
      { esAdminEmpresaActiva: () => esAdmin, empresaActiva: () => ({ id: 'WM' }), usaSalidas: () => usaSalidas } as any
    );
    actualizadas = [];
    comp.actualizada.subscribe((v: IVenta) => actualizadas.push(v));
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('menú', () => {
    it('un vendedor registra pagos, entrega y factura, pero no ajusta ni anula', () => {
      expect(etiquetas(venta())).toEqual(['Ver detalle', 'Registrar pago', 'Marcar entrega parcial', 'Marcar entregada', 'Agregar factura o boleta']);
    });

    it('el admin además ajusta y anula', () => {
      esAdmin = true;
      expect(etiquetas(venta())).toEqual(['Ver detalle', 'Registrar pago', 'Marcar entrega parcial', 'Marcar entregada', 'Agregar factura o boleta', 'Ajustar', 'Anular']);
    });

    it('sin saldo no ofrece registrar pago', () => {
      expect(etiquetas(venta({ pagado: 1180, saldo: 0 }))).not.toContain('Registrar pago');
    });

    it('con salidas, la entrega ya no se marca a mano', () => {
      const conSalidas = venta({ estado_entrega: 'PARCIAL', venta_items: [{ id: 'linea-1', descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100, importe: 1000, entregado: 5 }] });
      expect(etiquetas(conSalidas).filter((e: string) => e.startsWith('Marcar'))).toEqual([]);
    });

    it('detener salidas se ofrece solo si la empresa usa el módulo, y según cómo esté la venta', () => {
      expect(etiquetas(venta())).not.toContain('Detener salidas');
      usaSalidas = true;
      expect(etiquetas(venta())).toContain('Detener salidas');
      expect(etiquetas(venta({ salidas_detenidas_en: '2026-10-02T10:00:00Z' }))).toContain('Reanudar salidas');
      expect(etiquetas(venta({ salidas_detenidas_en: '2026-10-02T10:00:00Z' }))).not.toContain('Detener salidas');
    });

    it('no ofrece el estado de entrega en el que ya está', () => {
      expect(etiquetas(venta({ estado_entrega: 'ENTREGADA' }))).toEqual(expect.arrayContaining(['Marcar por entregar', 'Marcar entrega parcial']));
      expect(etiquetas(venta({ estado_entrega: 'ENTREGADA' }))).not.toContain('Marcar entregada');
    });

    it('una venta anulada solo se puede ver, también para el admin', () => {
      esAdmin = true;
      expect(etiquetas(venta({ estado: 'ANULADA' }))).toEqual(['Ver detalle']);
    });
  });

  it('el detalle trae el historial solo si no lo tiene', async () => {
    await comp.verDetalle(venta());
    expect(supabase.getCambiosVenta).toHaveBeenCalledWith('v1');
    expect(comp.detalle.venta_cambios).toHaveLength(1);

    supabase.getCambiosVenta.mockClear();
    await comp.verDetalle(venta({ venta_cambios: [] }));
    expect(supabase.getCambiosVenta).not.toHaveBeenCalled();
  });

  describe('registrar pago', () => {
    it('propone el saldo y hoy, y pide cómo se recibió', async () => {
      comp.abrirPago(venta());
      expect(comp.pago).toMatchObject({ monto: 1180, metodo: null, fecha: fechaIso() });

      await comp.registrarPago();

      expect(supabase.registrarPago).not.toHaveBeenCalled();
      expect(comp.faltantesPago).toEqual(['cómo se recibió']);
      expect(comp.mostrarFaltantesPago).toBe(true);
    });

    it('no acepta más que el saldo, ni 0, ni una fecha futura', () => {
      comp.abrirPago(venta());
      comp.pago.metodo = 'EFECTIVO';
      comp.pago.monto = 1180.01;
      expect(comp.faltantesPago).toEqual(['un monto que no supere el saldo']);
      comp.pago.monto = 0;
      expect(comp.faltantesPago).toEqual(['el monto']);
      comp.pago.monto = 10;
      comp.pago.fecha = '2999-01-01';
      expect(comp.faltantesPago).toEqual(['una fecha que no sea futura']);
    });

    it('al guardar actualiza el detalle y dice cuánto queda', async () => {
      await comp.verDetalle(venta({ venta_cambios: [] }));
      comp.abrirPago(venta());
      Object.assign(comp.pago, { monto: 500, metodo: 'YAPE_PLIN', referencia: ' OP-1 ', nota: '  ' });

      await comp.registrarPago();

      expect(supabase.registrarPago).toHaveBeenCalledWith('v1', { monto: 500, metodo: 'YAPE_PLIN', fecha: fechaIso(), referencia: 'OP-1', nota: null });
      expect(comp.pagoAbierto).toBe(false);
      expect(comp.detalle.saldo).toBe(680);
      expect(actualizadas[0].saldo).toBe(680);
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', detail: 'WM-V-00000001 queda debiendo S/ 680.00.' }));
    });

    it('si el servidor lo rechaza, muestra su motivo y deja la ventana abierta', async () => {
      supabase.registrarPago.mockRejectedValueOnce({ code: '22023', message: 'El pago de S/ 500 supera el saldo de S/ 100.' });
      comp.abrirPago(venta());
      comp.pago.metodo = 'EFECTIVO';

      await comp.registrarPago();

      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'El pago de S/ 500 supera el saldo de S/ 100.' }));
      expect(comp.pagoAbierto).toBe(true);
      expect(comp.guardando).toBe(false);
    });
  });

  describe('anular', () => {
    it('anular una venta pide motivo y dice qué pasa con su cotización', async () => {
      comp.pedirAnularVenta(venta({ folio_cotizacion: 'WM-00000021', estado_entrega: 'PARCIAL' }));
      expect(comp.pedido.mensaje).toContain('La cotización WM-00000021 vuelve a Pendiente.');
      expect(comp.pedido.mensaje).toContain('material entregado');

      await comp.confirmarMotivo();
      expect(supabase.anularVenta).not.toHaveBeenCalled();

      comp.motivo = ' El cliente desistió ';
      await comp.confirmarMotivo();

      expect(supabase.anularVenta).toHaveBeenCalledWith('v1', 'El cliente desistió');
      expect(comp.motivoAbierto).toBe(false);
      expect(actualizadas[0].estado).toBe('ANULADA');
    });

    it('con pagos vigentes no pide motivo: abre el detalle y avisa', () => {
      comp.pedirAnularVenta(venta({ pagado: 100, saldo: 1080, venta_cambios: [] }));
      expect(comp.motivoAbierto).toBe(false);
      expect(comp.detalleAbierto).toBe(true);
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
    });

    it('anular un pago pide motivo y usa el id del pago', async () => {
      const pago: any = { id: 'p1', monto: 400, fecha: '2026-10-05' };
      comp.pedirAnularPago(venta(), pago);
      comp.motivo = 'Se registró dos veces';
      await comp.confirmarMotivo();
      expect(supabase.anularPago).toHaveBeenCalledWith('p1', 'Se registró dos veces');
    });

    it('si el servidor no deja anular, se dice por qué', async () => {
      supabase.anularVenta.mockRejectedValueOnce({ code: '42501', message: 'Solo un admin de la empresa puede anular ventas.' });
      comp.pedirAnularVenta(venta());
      comp.motivo = 'x';
      await comp.confirmarMotivo();
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Solo un admin de la empresa puede anular ventas.' }));
      expect(comp.motivoAbierto).toBe(true);
    });
  });

  it('marcar la entrega no vuelve a guardar el estado actual', async () => {
    await comp.marcarEntrega(venta(), 'PENDIENTE');
    expect(supabase.marcarEntregaVenta).not.toHaveBeenCalled();

    await comp.marcarEntrega(venta(), 'ENTREGADA');
    expect(supabase.marcarEntregaVenta).toHaveBeenCalledWith('v1', 'ENTREGADA');
    expect(actualizadas[0].estado_entrega).toBe('ENTREGADA');
  });

  describe('facturas y boletas', () => {
    const pdf = (nombre: string, type = 'application/pdf', size = 1000): any => ({ name: nombre, type, size });
    const eventoCon = (archivo: any) => {
      const input: any = { files: [archivo], value: 'algo' };
      return { target: input } as any;
    };

    it('propone boleta para un DNI, factura para un RUC y el monto cobrado sin facturar', () => {
      comp.abrirComprobante(venta({ cliente_documento: '12345678' }));
      expect(comp.comprobante.tipo).toBe('BOLETA');
      comp.abrirComprobante(venta({ pagado: 300, saldo: 880 }));
      expect(comp.comprobante).toMatchObject({ tipo: 'FACTURA', numero: '', monto: 300, fecha: fechaIso() });
      comp.abrirComprobante(venta());
      expect(comp.comprobante.monto).toBe(1180);
    });

    it('pide número y monto; el archivo es opcional', async () => {
      comp.abrirComprobante(venta());
      comp.comprobante.monto = 0;
      await comp.guardarComprobante();
      expect(supabase.agregarComprobanteVenta).not.toHaveBeenCalled();
      expect(comp.faltantesComprobante).toEqual(['el número', 'el monto']);
      expect(comp.mostrarFaltantesComprobante).toBe(true);

      Object.assign(comp.comprobante, { numero: ' f001-1 ', monto: 500 });
      await comp.guardarComprobante();

      expect(supabase.agregarComprobanteVenta).toHaveBeenCalledWith('v1', { tipo: 'FACTURA', numero: 'F001-1', monto: 500, fecha: fechaIso() });
      expect(supabase.subirArchivoComprobante).not.toHaveBeenCalled();
      expect(comp.comprobanteAbierto).toBe(false);
      expect(actualizadas[0].venta_comprobantes).toHaveLength(1);
    });

    it('al elegir el archivo toma el número de su nombre, sin pisar lo escrito', async () => {
      comp.abrirComprobante(venta());
      const evento = eventoCon(pdf('20512345678-03-B001-77.pdf'));
      await comp.alElegirArchivo(evento);
      expect(comp.comprobante).toMatchObject({ tipo: 'BOLETA', numero: 'B001-77' });
      expect(comp.archivoElegido.nombre).toBe('20512345678-03-B001-77.pdf');
      expect(evento.target.value).toBe('');

      comp.comprobante.numero = 'F001-9';
      await comp.alElegirArchivo(eventoCon(pdf('F001-55.pdf')));
      expect(comp.comprobante.numero).toBe('F001-9');
    });

    it('rechaza al elegirlo lo que no sea PDF o foto, o pese demasiado', async () => {
      comp.abrirComprobante(venta());
      await comp.alElegirArchivo(eventoCon(pdf('hoja.xlsx', 'application/vnd.ms-excel')));
      expect(comp.archivoElegido).toBeNull();
      expect(mensajes.add).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'warn', detail: 'Sube un PDF o una foto.' }));

      await comp.alElegirArchivo(eventoCon(pdf('enorme.pdf', 'application/pdf', 11 * 1024 * 1024)));
      expect(comp.archivoElegido).toBeNull();
      expect(mensajes.add).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'El archivo pesa más de 10 MB.' }));
    });

    it('con archivo, guarda, sube y liga en ese orden', async () => {
      comp.abrirComprobante(venta());
      await comp.alElegirArchivo(eventoCon(pdf('F001-1.pdf')));
      await comp.guardarComprobante();

      expect(supabase.subirArchivoComprobante).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), comp.archivoElegido.contenido, 'pdf');
      expect(supabase.adjuntarArchivoComprobante).toHaveBeenCalledWith('c1', 'WM/v1/c1-1.pdf', 'F001-1.pdf');
      expect(actualizadas[0].venta_comprobantes[0].archivo_ruta).toBe('WM/v1/c1-1.pdf');
    });

    it('si el archivo falla, la factura queda guardada y lo avisa', async () => {
      supabase.subirArchivoComprobante.mockRejectedValueOnce(new Error('sin red'));
      comp.abrirComprobante(venta());
      await comp.alElegirArchivo(eventoCon(pdf('F001-1.pdf')));
      await comp.guardarComprobante();

      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn', summary: 'Factura F001-1 guardada, sin archivo' }));
      expect(comp.comprobanteAbierto).toBe(false);
      expect(actualizadas[0].venta_comprobantes[0].archivo_ruta).toBeNull();
      expect(comp.guardando).toBe(false);
    });

    it('si el servidor rechaza el número, dice por qué y deja la ventana abierta', async () => {
      supabase.agregarComprobanteVenta.mockRejectedValueOnce({ code: '22023', message: 'El número F001-1 ya está en esta venta.' });
      comp.abrirComprobante(venta());
      comp.comprobante.numero = 'F001-1';
      await comp.guardarComprobante();
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'El número F001-1 ya está en esta venta.' }));
      expect(comp.comprobanteAbierto).toBe(true);
    });

    it('avisa si con esta se factura de más, sin bloquear; sin IGV no se compara', () => {
      comp.abrirComprobante(venta({ venta_comprobantes: [conArchivo({ monto: 1000 })] }));
      comp.comprobante.monto = 200;
      expect(comp.excesoDeFactura).toBe(20);
      expect(comp.faltantesComprobante).toEqual(['el número']);

      comp.abrirComprobante(venta({ incluye_igv: false, venta_comprobantes: [conArchivo({ monto: 1000 })] }));
      comp.comprobante.monto = 9000;
      expect(comp.excesoDeFactura).toBe(0);
    });

    it('sube después el archivo de una factura guardada sin él', async () => {
      const input: any = { click: vi.fn() };
      const sinArchivo = conArchivo({ archivo_ruta: null });
      comp.elegirArchivoDe(sinArchivo, input);
      expect(input.click).toHaveBeenCalled();

      await comp.alElegirArchivoNuevo(eventoCon(pdf('F001-1.pdf')));

      expect(supabase.subirArchivoComprobante).toHaveBeenCalledWith(sinArchivo, expect.anything(), 'pdf');
      expect(supabase.adjuntarArchivoComprobante).toHaveBeenCalledWith('c1', 'WM/v1/c1-1.pdf', 'F001-1.pdf');
      expect(actualizadas).toHaveLength(1);
      expect(comp.subiendoArchivoDe).toBeNull();
    });

    it('un archivo inválido al subir después dice el motivo', async () => {
      comp.elegirArchivoDe(conArchivo({ archivo_ruta: null }), { click: vi.fn() } as any);
      await comp.alElegirArchivoNuevo(eventoCon(pdf('hoja.xlsx', 'application/vnd.ms-excel')));
      expect(supabase.subirArchivoComprobante).not.toHaveBeenCalled();
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'Sube un PDF o una foto.' }));
    });

    it('el archivo se abre con un enlace temporal, en una ventana abierta antes de pedirlo', async () => {
      const ventana: any = { location: { href: '' }, close: vi.fn() };
      vi.stubGlobal('window', { open: vi.fn(() => ventana), location: { href: '' } });
      await comp.verArchivo(conArchivo());
      expect(supabase.urlArchivoComprobante).toHaveBeenCalledWith('WM/v1/c1-1.pdf');
      expect(ventana.location.href).toBe('https://enlace.temporal/f.pdf');
    });

    it('si no consigue el enlace, cierra la ventana y lo dice', async () => {
      const ventana: any = { location: { href: '' }, close: vi.fn() };
      vi.stubGlobal('window', { open: vi.fn(() => ventana), location: { href: '' } });
      supabase.urlArchivoComprobante.mockRejectedValueOnce(new Error('sin red'));
      await comp.verArchivo(conArchivo());
      expect(ventana.close).toHaveBeenCalled();
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: 'No se abrió el archivo' }));
    });

    it('anular pide motivo y usa el id de la factura', async () => {
      comp.pedirAnularComprobante(conArchivo());
      expect(comp.pedido.titulo).toBe('Anular factura');
      expect(comp.pedido.mensaje).toContain('Su archivo se conserva');
      comp.motivo = 'Se emitió mal';
      await comp.confirmarMotivo();
      expect(supabase.anularComprobanteVenta).toHaveBeenCalledWith('c1', 'Se emitió mal');
      expect(actualizadas[0].venta_comprobantes[0].anulado).toBe(true);
    });

    it('anular una venta con facturas vigentes lo recuerda', () => {
      comp.pedirAnularVenta(venta({ venta_comprobantes: [conArchivo()] }));
      expect(comp.pedido.mensaje).toContain('nota de crédito');
      comp.pedirAnularVenta(venta({ venta_comprobantes: [conArchivo({ anulado: true })] }));
      expect(comp.pedido.mensaje).not.toContain('nota de crédito');
    });
  });

  it('ajustar abre el cotizador con las líneas, sus id y lo pagado', () => {
    comp.verDetalle(venta({ venta_cambios: [] }));
    comp.ajustar(venta({ pagado: 300, saldo: 880, condicion_pago: 'CREDITO', dias_credito: 30, descuento_global: 50 }));

    const borrador = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR_COTIZADOR)!);
    expect(borrador).toMatchObject({
      modo: 'ajuste', origen_id: 'v1', folio_origen: 'WM-V-00000001', pagado: 300, descuento: 50, modo_igv: 'sumar',
      datos_venta: { fecha: '2026-10-01', condicionPago: 'CREDITO', diasCredito: 30 }
    });
    expect(borrador.items[0]).toMatchObject({ id: 'linea-1', cantidad: 10, subtotal: 1000 });
    expect(router.navigate).toHaveBeenCalledWith(['/cotizador']);
    expect(comp.detalleAbierto).toBe(false);
  });

  it('la orden de venta se genera con la empresa activa', async () => {
    const v = venta();
    await comp.descargarPdf(v);
    expect(pdf.generarYDescargarOrdenVenta).toHaveBeenCalledWith(v, { id: 'WM' });
    expect(comp.descargando).toBe(false);
  });
  describe('salidas', () => {
    beforeEach(() => { usaSalidas = true; });

    it('el detalle trae las salidas solo si la empresa usa el módulo', async () => {
      await comp.verDetalle(venta());
      expect(comp.salidasDelDetalle).toHaveLength(1);

      usaSalidas = false;
      supabase.getSalidasDeVenta.mockClear();
      await comp.verDetalle(venta());
      expect(supabase.getSalidasDeVenta).not.toHaveBeenCalled();
      expect(comp.salidasDelDetalle).toBeNull();
    });

    it('detener pide motivo y lo envía', async () => {
      comp.pedirDetenerSalidas(venta());
      expect(comp.pedido.titulo).toBe('Detener salidas');
      comp.motivo = 'Debe el adelanto';
      await comp.confirmarMotivo();
      expect(supabase.detenerSalidasVenta).toHaveBeenCalledWith('v1', true, 'Debe el adelanto');
      expect(actualizadas[0].salidas_detenidas_en).toBeTruthy();
    });

    it('reanudar no pide motivo', async () => {
      await comp.reanudarSalidas(venta({ salidas_detenidas_en: '2026-10-02T10:00:00Z' }));
      expect(supabase.detenerSalidasVenta).toHaveBeenCalledWith('v1', false, null);
      expect(actualizadas[0].salidas_detenidas_en).toBeNull();
    });

    it('con material entregado, no pide motivo para anular: dice qué falta', () => {
      esAdmin = true;
      const conSalidas = venta({ venta_items: [{ id: 'linea-1', descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100, importe: 1000, entregado: 5 }] });
      comp.pedirAnularVenta(conSalidas);
      expect(comp.motivoAbierto).toBe(false);
      expect(mensajes.add.mock.calls[0][0].summary).toBe('Tiene salidas vigentes');
    });
  });
});
