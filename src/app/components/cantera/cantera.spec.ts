import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CanteraComponent } from './cantera';
import { IFotoCantera, ISalidaLocal } from '../../models';

const venta = {
  id: 'v1', folio: 'V-1', fecha: '2026-10-31', cliente: 'CONSTRUCTORA', lugar_entrega: null, detenida: false,
  lineas: [
    { id: 'l1', producto_id: 'p1', material: 'Arena', unidad: 'm3', cantidad: 100, entregado: 90 },
    { id: 'l2', producto_id: null, material: 'Bloqueta', unidad: 'und', cantidad: 500, entregado: 0 }
  ]
};

const foto = (extra: Partial<IFotoCantera['datos']> = {}): IFotoCantera => ({
  empresa_id: 'VDC', pedida_en: new Date().toISOString(),
  datos: {
    capacidad_m3: 25, ventas: [venta],
    vehiculos: [{ placa: 'ABC123', capacidad_m3: 18, chofer: 'Luis', ultima_salida_en: null }],
    materiales: [{ id: 'p1', material: 'Arena', unidad: 'm3' }], salidas_hoy: [], ...extra
  }
});

describe('CanteraComponent', () => {
  let comp: CanteraComponent;
  let cola: any;
  let router: any;

  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true, storage: { persist: async () => true } });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    cola = {
      locales: signal<ISalidaLocal[]>([]),
      foto: signal<IFotoCantera | null>(foto()),
      fallo: signal(false),
      sincronizando: signal(false),
      listo: signal(true),
      registrar: vi.fn(async (nueva: any) => ({ ...nueva, placa: 'ABC123' })),
      anular: vi.fn(async () => {}),
      iniciar: vi.fn(async () => {}),
      detener: vi.fn()
    };
    router = { navigate: vi.fn() };
    const session = {
      activarModoCampo: vi.fn(), empresaActiva: () => ({ id: 'VDC', capacidad_volquete_m3: 25 }), usuario: () => ({ id: 'u1' }),
      esAdminEmpresaActiva: () => false, esEncargado: () => true, empresas: () => []
    };
    comp = new CanteraComponent(
      cola, session as any, {} as any, {} as any, router,
      { queryParamMap: of({ get: () => null }) } as any, {} as any,
      { nativeElement: { scrollTop: 0 } } as any, { markForCheck: () => {} } as any
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const abrirVenta = () => (comp as any).abrir('v1');
  const linea = (id: string) => venta.lineas.find(l => l.id === id)!;

  // Con filas nuevas en cada lectura, *ngFor rehace el campo del motivo y la página se congela.
  it('la lista de hoy no cambia entre un refresco y otro si no cambió nada', () => {
    expect(comp.filasDeHoy()).toBe(comp.filasDeHoy());
  });

  it('la lista de hoy se entera de una salida nueva', () => {
    cola.locales.set([{ id: 's1', fecha: comp.filasDeHoy.length ? '' : new Date().toLocaleDateString('en-CA'), registrada_en: new Date().toISOString(), envio: 'pendiente', cantidad: 25, unidad: 'm3', placa: 'ABC123', cliente: 'C', material: 'Arena', usuario_id: 'u1' } as any]);
    expect(comp.filasDeHoy()).toHaveLength(1);
    expect(comp.resumenHoy()).toBe('1 viaje · 25 m³');
  });

  describe('la señal', () => {
    it('dice que no hay si el último intento no llegó, aunque el celular crea que sí', () => {
      cola.fallo.set(true);
      expect(comp.textoSenal).toBe('Sin señal');
      expect(comp.haySenal).toBe(false);
    });

    it('mientras intenta por primera vez no asegura nada', () => {
      cola.sincronizando.set(true);
      expect(comp.textoSenal).toBe('Conectando…');
    });

    it('si el último intento falló, reintentar no vuelve a decir que conecta', () => {
      cola.fallo.set(true);
      cola.sincronizando.set(true);
      expect(comp.textoSenal).toBe('Sin señal');
    });
  });

  describe('el formulario de una venta', () => {
    it('con una sola línea por salir, esa queda elegida', () => {
      cola.foto.set(foto({ ventas: [{ ...venta, lineas: [venta.lineas[0]] }] }));
      abrirVenta();
      expect(comp.form.lineaId).toBe('l1');
    });

    it('con varias, elige el encargado', () => {
      abrirVenta();
      expect(comp.form.lineaId).toBeNull();
      expect(comp.faltantes).toContain('qué material');
    });

    it('la cantidad sale de la capacidad del volquete, salvo que falte menos', () => {
      abrirVenta();
      comp.elegirLinea(linea('l1'));
      expect(comp.form.cantidad).toBe(10);

      cola.foto.set(foto({ ventas: [{ ...venta, lineas: [{ ...venta.lineas[0], entregado: 0 }, venta.lineas[1]] }] }));
      comp.elegirVolquete({ placa: 'ABC123', capacidad_m3: 18, chofer: 'Luis', ultima_salida_en: null });
      expect(comp.form.cantidad).toBe(18);
      expect(comp.form.placa).toBe('ABC-123');
      expect(comp.form.chofer).toBe('Luis');
    });

    it('escribir una placa conocida es como tocarla', () => {
      abrirVenta();
      comp.elegirLinea(linea('l1'));
      comp.form.placa = 'abc-123';
      comp.alEscribirPlaca();
      expect(comp.form.chofer).toBe('Luis');
    });

    it('lo corregido a mano no se vuelve a cambiar', () => {
      abrirVenta();
      comp.elegirLinea(linea('l1'));
      comp.form.cantidad = 7;
      comp.alEditarCantidad();
      comp.elegirVolquete({ placa: 'ABC123', capacidad_m3: 18, chofer: null, ultima_salida_en: null });
      expect(comp.form.cantidad).toBe(7);
    });

    it('por unidades no adivina: la escribe el encargado', () => {
      abrirVenta();
      comp.elegirLinea(linea('l2'));
      expect(comp.form.cantidad).toBeNull();
      expect(comp.faltantes).toContain('la cantidad');
    });

    it('avisa cuánto se pasa, pero deja guardar', async () => {
      abrirVenta();
      comp.elegirLinea(linea('l1'));
      comp.form.cantidad = 25;
      comp.alEditarCantidad();
      comp.form.placa = 'ABC-123';
      expect(comp.exceso).toBe(15);
      await comp.guardar();
      expect(cola.registrar).toHaveBeenCalled();
    });

    it('sin placa no guarda y dice qué falta', async () => {
      abrirVenta();
      comp.elegirLinea(linea('l1'));
      await comp.guardar();
      expect(cola.registrar).not.toHaveBeenCalled();
      expect(comp.mostrarFaltantes).toBe(true);
      expect(comp.faltantes).toEqual(['la placa']);
    });

    it('guarda los datos de la venta y queda listo para el siguiente volquete', async () => {
      abrirVenta();
      comp.elegirLinea(linea('l1'));
      comp.form.placa = 'ABC-123';
      comp.alEscribirPlaca();
      comp.form.guia = ' T001-5 ';
      await comp.guardar();

      expect(cola.registrar).toHaveBeenCalledWith(expect.objectContaining({
        venta_id: 'v1', venta_item_id: 'l1', folio_venta: 'V-1', cliente: 'CONSTRUCTORA', producto_id: 'p1',
        material: 'Arena', unidad: 'm3', placa: 'ABC-123', guia: 'T001-5', chofer: 'Luis'
      }));
      expect(comp.confirmacion).toContain('ABC-123');
      expect(comp.form).toMatchObject({ lineaId: 'l1', placa: '', chofer: '', guia: '' });
    });

    it('si el celular no deja guardar, lo dice y no lo da por guardado', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      cola.registrar.mockRejectedValue(new Error('Disco lleno'));
      abrirVenta();
      comp.elegirLinea(linea('l1'));
      comp.form.placa = 'ABC-123';
      await comp.guardar();
      expect(comp.errorAlmacen).toBe(true);
      expect(comp.confirmacion).toBeNull();
      expect(comp.form.placa).toBe('ABC-123');
    });
  });

  describe('una salida sin venta', () => {
    beforeEach(() => (comp as any).abrir('sin-venta'));

    it('pide para quién y qué material', () => {
      expect(comp.faltantes).toEqual(['para quién es', 'qué material', 'la placa']);
    });

    it('al guardar se queda con el cliente y el material: suelen salir varios seguidos', async () => {
      comp.form.cliente = ' Don Julio ';
      comp.elegirMaterial({ id: 'p1', material: 'Arena', unidad: 'm3' });
      comp.form.placa = 'XYZ-789';
      await comp.guardar();

      expect(cola.registrar).toHaveBeenCalledWith(expect.objectContaining({
        venta_id: null, venta_item_id: null, cliente: 'Don Julio', producto_id: 'p1', material: 'Arena', unidad: 'm3', cantidad: 25
      }));
      expect(comp.form).toMatchObject({ cliente: ' Don Julio ', material: 'Arena', placa: '' });
    });

    it('un material escrito a mano no queda ligado al catálogo', () => {
      comp.elegirMaterial({ id: 'p1', material: 'Arena', unidad: 'm3' });
      comp.form.material = 'Arena fina';
      comp.alEscribirMaterial();
      expect(comp.form.materialId).toBeNull();
    });
  });

  describe('anular', () => {
    const fila: any = { id: 's1', anulada: false, usuario_id: 'u1' };

    it('quien la registró; la de otro, no', () => {
      expect(comp.puedeAnular(fila)).toBe(true);
      expect(comp.puedeAnular({ ...fila, usuario_id: 'u2' })).toBe(false);
      expect(comp.puedeAnular({ ...fila, anulada: true })).toBe(false);
    });

    it('sin motivo no se anula', async () => {
      comp.empezarAnular(fila);
      comp.motivoAnulacion = '   ';
      await comp.confirmarAnular(fila);
      expect(cola.anular).not.toHaveBeenCalled();
      expect(comp.anulandoId).toBe('s1');
    });

    it('con motivo se anula y se cierra', async () => {
      comp.empezarAnular(fila);
      comp.motivoAnulacion = ' Me equivoqué ';
      await comp.confirmarAnular(fila);
      expect(cola.anular).toHaveBeenCalledWith('s1', 'Me equivoqué', undefined);
      expect(comp.anulandoId).toBeNull();
    });
  });
});
