import { describe, it, expect } from 'vitest';
import {
  IFotoCantera, ISalidaDeHoy, ISalidaLocal, cantidadConUnidad, cantidadPropuesta, esRechazoDefinitivo, faltanteDeLinea, formatoPlaca,
  haceCuanto, motivosDeRevision, normalizarPlaca, resumenDelDia, salidasDeHoy, volquetesConocidos
} from './salida.model';
import { esUnidadDeServicio, esUnidadDeVolumen } from './producto.model';

const local = (extra: Partial<ISalidaLocal> = {}): ISalidaLocal => ({
  id: 's1', empresa_id: 'VDC', usuario_id: 'u1', venta_id: 'v1', venta_item_id: 'l1', folio_venta: 'V-1', cliente: 'CLIENTE', producto_id: null,
  material: 'Arena', unidad: 'm3', cantidad: 25, placa: 'ABC123', chofer: null, guia: null, fecha: '2026-10-31',
  registrada_en: '2026-10-31T10:00:00.000Z', envio: 'pendiente', ...extra
});

const delServidor = (extra: Partial<ISalidaDeHoy> = {}): ISalidaDeHoy => ({
  id: 's2', venta_id: 'v1', venta_item_id: 'l1', folio_venta: 'V-1', cliente: 'CLIENTE', material: 'Arena', unidad: 'm3', cantidad: 20,
  placa: 'DEF456', chofer: null, guia: null, fecha: '2026-10-31', registrada_en: '2026-10-31T09:00:00.000Z', estado: 'ACTIVA',
  creado_por: 'u2', creado_por_nombre: 'Otro', motivo_anulacion: null, ...extra
});

const foto = (vehiculos: IFotoCantera['datos']['vehiculos'] = []): IFotoCantera => ({
  empresa_id: 'VDC', pedida_en: '2026-10-31T08:00:00.000Z',
  datos: { capacidad_m3: 25, ventas: [], vehiculos, materiales: [], salidas_hoy: [] }
});

describe('placas', () => {
  it('"abc-123 " y "ABC123" son el mismo volquete', () => {
    expect(normalizarPlaca(' abc-123 ')).toBe('ABC123');
    expect(normalizarPlaca('a1b 234')).toBe('A1B234');
    expect(normalizarPlaca(null)).toBe('');
  });

  it('se muestran con guion solo las de seis caracteres', () => {
    expect(formatoPlaca('ABC123')).toBe('ABC-123');
    expect(formatoPlaca('VOLQ1')).toBe('VOLQ1');
  });
});

describe('unidades', () => {
  it('un flete o un alquiler no sale de la cantera', () => {
    for (const u of ['viaje', 'hora', 'día', 'dia', 'mes', 'glb', ' Viaje ']) expect(esUnidadDeServicio(u)).toBe(true);
    for (const u of ['m3', 'und', 'bolsa', 'kg', '']) expect(esUnidadDeServicio(u)).toBe(false);
  });

  it('solo el volumen se propone con la capacidad del volquete', () => {
    expect(esUnidadDeVolumen('m3')).toBe(true);
    expect(esUnidadDeVolumen('M³')).toBe(true);
    expect(esUnidadDeVolumen('und')).toBe(false);
  });

  it('muestra la cantidad con su unidad, sin ceros de más', () => {
    expect(cantidadConUnidad(25, 'm3')).toBe('25 m³');
    expect(cantidadConUnidad(12.5, 'm3')).toBe('12.5 m³');
    expect(cantidadConUnidad(1500, 'bolsa')).toBe('1,500 bolsa');
  });
});

describe('faltanteDeLinea', () => {
  const linea = { id: 'l1', cantidad: 100, entregado: 25 };
  const PEDIDA = '2026-10-31T12:00:00.000Z';
  const ANTES = '2026-10-31T11:00:00.000Z';
  const DESPUES = '2026-10-31T13:00:00.000Z';

  it('lo que dice el servidor, si en el celular no hay nada', () => {
    expect(faltanteDeLinea(linea, [], PEDIDA)).toBe(75);
  });

  it('descuenta lo que aún no se envía', () => {
    expect(faltanteDeLinea(linea, [local()], PEDIDA)).toBe(50);
  });

  it('no cuenta dos veces lo que ya venía en la copia', () => {
    expect(faltanteDeLinea(linea, [local({ envio: 'enviada', enviada_en: ANTES })], PEDIDA)).toBe(75);
  });

  it('descuenta lo enviado después de bajar la copia', () => {
    expect(faltanteDeLinea(linea, [local({ envio: 'enviada', enviada_en: DESPUES })], PEDIDA)).toBe(50);
  });

  it('una anulada que no se envió no descuenta', () => {
    expect(faltanteDeLinea(linea, [local({ anulacion: { motivo: 'x', anulada_en: PEDIDA, envio: 'pendiente' } })], PEDIDA)).toBe(75);
  });

  it('devuelve lo que la copia contaba de una que se anuló después', () => {
    const anulada = local({ envio: 'enviada', enviada_en: ANTES, anulacion: { motivo: 'x', anulada_en: DESPUES, envio: 'pendiente' } });
    expect(faltanteDeLinea(linea, [anulada], PEDIDA)).toBe(100);
  });

  it('si la anulación ya venía en la copia, no se devuelve dos veces', () => {
    const anulada = local({ envio: 'enviada', enviada_en: ANTES, anulacion: { motivo: 'x', anulada_en: ANTES, envio: 'enviada', enviada_en: ANTES } });
    expect(faltanteDeLinea(linea, [anulada], PEDIDA)).toBe(75);
  });

  it('una rechazada por el servidor igual salió de la cantera', () => {
    expect(faltanteDeLinea(linea, [local({ envio: 'con_problema', problema: 'x' })], PEDIDA)).toBe(50);
  });

  it('solo cuenta las de esa línea', () => {
    expect(faltanteDeLinea(linea, [local({ venta_item_id: 'l2' }), local({ venta_item_id: null })], PEDIDA)).toBe(75);
  });

  it('puede quedar negativo: se pasaron de lo vendido', () => {
    expect(faltanteDeLinea({ id: 'l1', cantidad: 10, entregado: 0 }, [local()], PEDIDA)).toBe(-15);
  });
});

describe('volquetesConocidos', () => {
  it('lo anotado en el celular cuenta aunque no se haya enviado, y va primero', () => {
    const lista = volquetesConocidos(
      foto([{ placa: 'DEF456', capacidad_m3: 20, chofer: 'Luis', ultima_salida_en: '2026-10-30T10:00:00.000Z' }]),
      [local({ placa: 'NUE111', cantidad: 18, chofer: 'Ana' })]
    );
    expect(lista.map(v => v.placa)).toEqual(['NUE111', 'DEF456']);
    expect(lista[0]).toMatchObject({ capacidad_m3: 18, chofer: 'Ana' });
  });

  it('una placa conocida conserva su capacidad: una carga a medias no la cambia', () => {
    const lista = volquetesConocidos(
      foto([{ placa: 'ABC123', capacidad_m3: 25, chofer: 'Luis', ultima_salida_en: null }]),
      [local({ cantidad: 3, chofer: null })]
    );
    expect(lista[0]).toMatchObject({ capacidad_m3: 25, chofer: 'Luis' });
  });

  it('una anotada por unidades no inventa una capacidad', () => {
    expect(volquetesConocidos(null, [local({ unidad: 'und', cantidad: 500 })])[0].capacidad_m3).toBeNull();
  });

  it('lo anulado no enseña un volquete', () => {
    expect(volquetesConocidos(null, [local({ anulacion: { motivo: 'x', anulada_en: '', envio: 'pendiente' } })])).toEqual([]);
  });
});

describe('cantidadPropuesta', () => {
  it('la capacidad del volquete', () => {
    expect(cantidadPropuesta(20, 25, 100)).toBe(20);
  });

  it('sin capacidad, la de la empresa', () => {
    expect(cantidadPropuesta(null, 25, 100)).toBe(25);
  });

  it('lo que falta si es menos que la carga: es el último viaje', () => {
    expect(cantidadPropuesta(25, 25, 3)).toBe(3);
  });

  it('si ya no falta nada, la carga: el encargado decide', () => {
    expect(cantidadPropuesta(25, 25, 0)).toBe(25);
    expect(cantidadPropuesta(25, 25, -5)).toBe(25);
  });
});

describe('salidasDeHoy', () => {
  const HOY = '2026-10-31';

  it('junta lo del celular con lo que llegó de otro, de lo más reciente a lo más antiguo', () => {
    const filas = salidasDeHoy([local()], [delServidor()], HOY);
    expect(filas.map(f => f.id)).toEqual(['s1', 's2']);
    expect(filas[1]).toMatchObject({ envio: 'enviada', usuario_id: 'u2', usuario_nombre: 'Otro' });
  });

  it('si está en los dos, manda el celular y no se repite', () => {
    const filas = salidasDeHoy([local({ id: 's2', envio: 'pendiente' })], [delServidor()], HOY);
    expect(filas).toHaveLength(1);
    expect(filas[0].envio).toBe('pendiente');
  });

  it('solo las de hoy', () => {
    expect(salidasDeHoy([local({ fecha: '2026-10-30' })], [delServidor({ fecha: '2026-10-30' })], HOY)).toEqual([]);
  });

  it('una anulación pendiente se ve como por enviar', () => {
    const filas = salidasDeHoy([local({ envio: 'enviada', anulacion: { motivo: 'Mal', anulada_en: '', envio: 'pendiente' } })], [], HOY);
    expect(filas[0]).toMatchObject({ anulada: true, envio: 'pendiente', motivo_anulacion: 'Mal' });
  });

  it('una anulada desde la oficina se ve anulada aunque en el celular no lo esté', () => {
    const filas = salidasDeHoy([local({ id: 's2', envio: 'enviada' })], [delServidor({ estado: 'ANULADA', motivo_anulacion: 'Oficina' })], HOY);
    expect(filas[0]).toMatchObject({ anulada: true, motivo_anulacion: 'Oficina' });
  });

  it('muestra el problema de la salida o de su anulación', () => {
    expect(salidasDeHoy([local({ envio: 'con_problema', problema: 'Rechazada' })], [], HOY)[0]).toMatchObject({ envio: 'con_problema', problema: 'Rechazada' });
    const anulacion = local({ envio: 'enviada', anulacion: { motivo: 'x', anulada_en: '', envio: 'con_problema', problema: 'Fuera de día' } });
    expect(salidasDeHoy([anulacion], [], HOY)[0]).toMatchObject({ envio: 'con_problema', problema: 'Fuera de día' });
  });
});

describe('resumenDelDia', () => {
  it('cuenta viajes y suma por unidad, sin lo anulado', () => {
    expect(resumenDelDia([
      { anulada: false, cantidad: 25, unidad: 'm3' },
      { anulada: false, cantidad: 25, unidad: 'm3' },
      { anulada: false, cantidad: 100, unidad: 'bolsa' },
      { anulada: true, cantidad: 25, unidad: 'm3' }
    ])).toBe('3 viajes · 50 m³ · 100 bolsa');
  });

  it('un viaje en singular', () => {
    expect(resumenDelDia([{ anulada: false, cantidad: 25, unidad: 'm3' }])).toBe('1 viaje · 25 m³');
  });

  it('sin salidas lo dice', () => {
    expect(resumenDelDia([])).toBe('Sin salidas todavía');
  });
});

describe('haceCuanto', () => {
  const ahora = new Date('2026-10-31T12:00:00.000Z');

  it('dice cuánto hace en palabras', () => {
    expect(haceCuanto('2026-10-31T11:59:40.000Z', ahora)).toBe('hace un momento');
    expect(haceCuanto('2026-10-31T11:50:00.000Z', ahora)).toBe('hace 10 min');
    expect(haceCuanto('2026-10-31T09:00:00.000Z', ahora)).toBe('hace 3 horas');
    expect(haceCuanto('2026-10-31T11:00:00.000Z', ahora)).toBe('hace 1 hora');
    expect(haceCuanto('2026-10-29T12:00:00.000Z', ahora)).toBe('hace 2 días');
    expect(haceCuanto(null, ahora)).toBe('nunca');
  });
});

describe('esRechazoDefinitivo', () => {
  it('una regla del servidor o un dato inválido no se arregla reintentando', () => {
    for (const code of ['22023', 'P0001', '23514', '22P02']) expect(esRechazoDefinitivo({ code })).toBe(true);
  });

  it('sin señal puede llegar como permisos: el token venció. Se reintenta', () => {
    for (const code of ['42501', 'PGRST301', 'PGRST202', '', undefined]) expect(esRechazoDefinitivo({ code })).toBe(false);
    expect(esRechazoDefinitivo(null)).toBe(false);
    expect(esRechazoDefinitivo(new TypeError('Failed to fetch') as any)).toBe(false);
  });
});

describe('motivosDeRevision', () => {
  it('sin venta lo dice primero', () => {
    expect(motivosDeRevision({ venta_id: null, venta_item_id: null, avisos: [] })).toEqual(['Salió sin venta']);
  });

  it('venta anulada: no repite que salió sin venta', () => {
    expect(motivosDeRevision({ venta_id: null, venta_item_id: null, avisos: ['VENTA_ANULADA'] })).toEqual(['La venta estaba anulada']);
  });

  it('dice todo lo que no calzó', () => {
    expect(motivosDeRevision({ venta_id: 'v1', venta_item_id: 'l1', avisos: ['EXCEDE', 'DETENIDA'] }))
      .toEqual(['Se pasa de lo vendido', 'Salió con la venta detenida']);
  });
});
