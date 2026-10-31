// src/app/models/salida.model.ts
import { fechaIso } from './venta.model';
import { UNIDADES_COMUNES, esUnidadDeVolumen } from './producto.model';

export type EstadoSalida = 'ACTIVA' | 'ANULADA';
/** Lo que no calzó al llegar la salida. No se rechaza: queda para que la oficina lo revise. */
export type AvisoSalida = 'DETENIDA' | 'EXCEDE' | 'VENTA_ANULADA' | 'LINEA_QUITADA';
export type PropietarioVehiculo = 'PROPIO' | 'TERCERO' | 'CLIENTE';
/** Cómo va una salida guardada en el celular. */
export type EstadoEnvio = 'pendiente' | 'enviada' | 'con_problema';

export const MODULO_SALIDAS = 'salidas';

export const ETIQUETA_AVISO: Record<AvisoSalida, string> = {
  DETENIDA: 'Salió con la venta detenida',
  EXCEDE: 'Se pasa de lo vendido',
  VENTA_ANULADA: 'La venta estaba anulada',
  LINEA_QUITADA: 'Esa línea ya no está en la venta'
};

export const PROPIETARIOS: Array<{ value: PropietarioVehiculo; label: string }> = [
  { value: 'PROPIO', label: 'Propio' },
  { value: 'TERCERO', label: 'De tercero' },
  { value: 'CLIENTE', label: 'Del cliente' }
];

export interface ISalida {
  id: string;
  empresa_id: string;
  venta_id?: string | null;
  venta_item_id?: string | null;
  folio_venta?: string | null;
  cliente: string;
  producto_id?: string | null;
  material: string;
  unidad: string;
  cantidad: number;
  placa: string;
  chofer?: string | null;
  guia?: string | null;
  fecha: string;
  registrada_en: string;
  recibida_en?: string;
  creado_por?: string | null;
  creado_por_nombre?: string | null;
  estado: EstadoSalida;
  avisos: AvisoSalida[];
  por_revisar: boolean;
  revisada_en?: string | null;
  revisada_por_nombre?: string | null;
  nota_revision?: string | null;
  anulada_en?: string | null;
  anulada_por_nombre?: string | null;
  motivo_anulacion?: string | null;
}

export interface IVehiculo {
  id: string;
  empresa_id: string;
  placa: string;
  capacidad_m3: number | null;
  /** Vacío: lo agregó el encargado y falta completarlo en oficina. */
  propietario: PropietarioVehiculo | null;
  chofer: string | null;
  activo: boolean;
  ultima_salida_en?: string | null;
}

// ─── Lo que baja al celular (datos_cantera): sin montos ─────────────────────

export interface ILineaCantera {
  id: string;
  producto_id: string | null;
  material: string;
  unidad: string;
  cantidad: number;
  entregado: number;
}

export interface IVentaCantera {
  id: string;
  folio: string;
  fecha: string;
  cliente: string;
  lugar_entrega: string | null;
  detenida: boolean;
  lineas: ILineaCantera[];
}

export interface IVehiculoCantera {
  placa: string;
  capacidad_m3: number | null;
  chofer: string | null;
  ultima_salida_en: string | null;
}

export interface IMaterialCantera {
  id: string;
  material: string;
  unidad: string;
}

export interface ISalidaDeHoy {
  id: string;
  venta_id: string | null;
  venta_item_id: string | null;
  folio_venta: string | null;
  cliente: string;
  material: string;
  unidad: string;
  cantidad: number;
  placa: string;
  chofer: string | null;
  guia: string | null;
  fecha: string;
  registrada_en: string;
  estado: EstadoSalida;
  creado_por: string | null;
  creado_por_nombre: string | null;
  motivo_anulacion: string | null;
}

export interface IDatosCantera {
  capacidad_m3: number;
  ventas: IVentaCantera[];
  vehiculos: IVehiculoCantera[];
  materiales: IMaterialCantera[];
  salidas_hoy: ISalidaDeHoy[];
}

/** La última copia bajada. `pedida_en` es la hora del celular, igual que `enviada_en`. */
export interface IFotoCantera {
  empresa_id: string;
  pedida_en: string;
  datos: IDatosCantera;
}

// ─── Lo que se guarda en el celular ─────────────────────────────────────────

export interface IAnulacionLocal {
  motivo: string;
  anulada_en: string;
  envio: EstadoEnvio;
  enviada_en?: string;
  problema?: string;
}

export interface ISalidaLocal {
  id: string;
  empresa_id: string;
  /** Solo se envía con la sesión de quien la anotó: si no, quedaría a nombre de otro. */
  usuario_id: string;
  usuario_nombre?: string | null;
  venta_id: string | null;
  venta_item_id: string | null;
  folio_venta: string | null;
  cliente: string;
  producto_id: string | null;
  material: string;
  unidad: string;
  cantidad: number;
  placa: string;
  chofer: string | null;
  guia: string | null;
  fecha: string;
  registrada_en: string;
  envio: EstadoEnvio;
  enviada_en?: string;
  problema?: string;
  anulacion?: IAnulacionLocal;
}

// ─── Reglas ─────────────────────────────────────────────────────────────────

/** "abc-123 " y "ABC123" son el mismo volquete. Mismo criterio que normalizar_placa(). */
export function normalizarPlaca(placa: string | null | undefined): string {
  return String(placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatoPlaca(placa: string | null | undefined): string {
  const limpia = normalizarPlaca(placa);
  return limpia.length === 6 ? `${limpia.slice(0, 3)}-${limpia.slice(3)}` : limpia;
}

export function etiquetaDeUnidad(unidad: string): string {
  return UNIDADES_COMUNES.find(u => u.value === unidad)?.label ?? unidad;
}

/** "25 m³", "12.5 m³", "40 bolsa". */
export function cantidadConUnidad(cantidad: number, unidad: string): string {
  const numero = Number(cantidad).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${numero} ${etiquetaDeUnidad(unidad)}`;
}

/**
 * Cuánto falta entregar de una línea, según lo que sabe el celular. La copia del
 * servidor no incluye lo que aún no llegó, ni lo que se envió después de bajarla:
 * eso lo pone `pedidaEn`. Puede ser negativo si se pasaron de lo vendido.
 */
export function faltanteDeLinea(
  linea: Pick<ILineaCantera, 'id' | 'cantidad' | 'entregado'>,
  locales: ISalidaLocal[],
  pedidaEn: string | null
): number {
  let faltante = Number(linea.cantidad) - Number(linea.entregado);
  for (const salida of locales) {
    if (salida.venta_item_id !== linea.id) continue;
    const yaEnLaCopia = (enviadaEn?: string) => !!enviadaEn && !!pedidaEn && enviadaEn <= pedidaEn;
    const contadaEnElServidor =
      salida.envio === 'enviada' && yaEnLaCopia(salida.enviada_en) &&
      !(salida.anulacion?.envio === 'enviada' && yaEnLaCopia(salida.anulacion.enviada_en));
    const cuenta = salida.anulacion ? 0 : Number(salida.cantidad);
    faltante -= cuenta - (contadaEnElServidor ? Number(salida.cantidad) : 0);
  }
  return Math.round(faltante * 10000) / 10000;
}

/** Los volquetes conocidos: lo anotado en este celular primero, aunque aún no se haya enviado. */
export function volquetesConocidos(foto: IFotoCantera | null, locales: ISalidaLocal[]): IVehiculoCantera[] {
  const porPlaca = new Map<string, IVehiculoCantera>();
  for (const v of foto?.datos.vehiculos ?? []) porPlaca.set(v.placa, v);

  const recientes = [...locales]
    .filter(s => !s.anulacion)
    .sort((a, b) => a.registrada_en.localeCompare(b.registrada_en));
  for (const salida of recientes) {
    const conocido = porPlaca.get(salida.placa);
    porPlaca.set(salida.placa, {
      placa: salida.placa,
      capacidad_m3: conocido?.capacidad_m3 ?? (esUnidadDeVolumen(salida.unidad) ? Number(salida.cantidad) : null),
      chofer: salida.chofer ?? conocido?.chofer ?? null,
      ultima_salida_en: conocido?.ultima_salida_en && conocido.ultima_salida_en > salida.registrada_en
        ? conocido.ultima_salida_en
        : salida.registrada_en
    });
  }
  return [...porPlaca.values()].sort((a, b) =>
    (b.ultima_salida_en ?? '').localeCompare(a.ultima_salida_en ?? '') || a.placa.localeCompare(b.placa));
}

/**
 * Lo que se propone al elegir el volquete: su capacidad, salvo que falte menos que
 * eso para terminar la línea. Siempre se puede corregir.
 */
export function cantidadPropuesta(capacidad: number | null | undefined, capacidadEmpresa: number, faltante: number | null): number {
  const carga = Number(capacidad) > 0 ? Number(capacidad) : capacidadEmpresa;
  return faltante !== null && faltante > 0 && faltante < carga ? faltante : carga;
}

/** Una fila de "Salidas de hoy": lo del celular, o lo que llegó de otro celular. */
export interface IFilaDeHoy {
  id: string;
  cliente: string;
  folio_venta: string | null;
  material: string;
  unidad: string;
  cantidad: number;
  placa: string;
  chofer: string | null;
  guia: string | null;
  registrada_en: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  anulada: boolean;
  motivo_anulacion: string | null;
  envio: EstadoEnvio;
  problema: string | null;
}

/** Junta lo anotado en el celular con lo que dice el servidor. Si está en los dos, manda el celular. */
export function salidasDeHoy(locales: ISalidaLocal[], servidor: ISalidaDeHoy[], hoy: string = fechaIso()): IFilaDeHoy[] {
  const filas = new Map<string, IFilaDeHoy>();
  for (const s of servidor) {
    if (s.fecha !== hoy) continue;
    filas.set(s.id, {
      id: s.id, cliente: s.cliente, folio_venta: s.folio_venta, material: s.material, unidad: s.unidad,
      cantidad: Number(s.cantidad), placa: s.placa, chofer: s.chofer, guia: s.guia, registrada_en: s.registrada_en,
      usuario_id: s.creado_por, usuario_nombre: s.creado_por_nombre,
      anulada: s.estado === 'ANULADA', motivo_anulacion: s.motivo_anulacion, envio: 'enviada', problema: null
    });
  }
  for (const s of locales) {
    if (s.fecha !== hoy) continue;
    const desdeServidor = filas.get(s.id);
    filas.set(s.id, {
      id: s.id, cliente: s.cliente, folio_venta: s.folio_venta, material: s.material, unidad: s.unidad,
      cantidad: Number(s.cantidad), placa: s.placa, chofer: s.chofer, guia: s.guia, registrada_en: s.registrada_en,
      usuario_id: s.usuario_id, usuario_nombre: s.usuario_nombre ?? null,
      anulada: !!s.anulacion || !!desdeServidor?.anulada,
      motivo_anulacion: s.anulacion?.motivo ?? desdeServidor?.motivo_anulacion ?? null,
      envio: s.envio !== 'enviada' ? s.envio : s.anulacion?.envio ?? 'enviada',
      problema: s.problema ?? s.anulacion?.problema ?? null
    });
  }
  return [...filas.values()].sort((a, b) => b.registrada_en.localeCompare(a.registrada_en));
}

/** "12 viajes · 300 m³ · 40 bolsa": lo que se lleva hoy, sin lo anulado. */
export function resumenDelDia(filas: Array<Pick<IFilaDeHoy, 'anulada' | 'cantidad' | 'unidad'>>): string {
  const vigentes = filas.filter(f => !f.anulada);
  if (!vigentes.length) return 'Sin salidas todavía';
  const porUnidad = new Map<string, number>();
  for (const f of vigentes) porUnidad.set(f.unidad, (porUnidad.get(f.unidad) ?? 0) + Number(f.cantidad));
  const viajes = `${vigentes.length} viaje${vigentes.length === 1 ? '' : 's'}`;
  return [viajes, ...[...porUnidad].map(([unidad, total]) => cantidadConUnidad(total, unidad))].join(' · ');
}

export function haceCuanto(fecha: string | null | undefined, ahora: Date = new Date()): string {
  if (!fecha) return 'nunca';
  const minutos = Math.floor((ahora.getTime() - new Date(fecha).getTime()) / 60000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} hora${horas === 1 ? '' : 's'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

/** Sin señal, el error llega como de conexión o de permisos; solo estos los puso una regla. */
export function esRechazoDefinitivo(error: { code?: string } | null | undefined): boolean {
  const codigo = String(error?.code ?? '');
  return codigo === 'P0001' || /^(22|23)/.test(codigo);
}

// ─── En oficina ─────────────────────────────────────────────────────────────

/** Por qué una salida está por revisar, en palabras. */
export function motivosDeRevision(salida: Pick<ISalida, 'venta_id' | 'venta_item_id' | 'avisos'>): string[] {
  const motivos = (salida.avisos ?? []).map(a => ETIQUETA_AVISO[a] ?? a);
  if (!salida.venta_id && !salida.avisos?.includes('VENTA_ANULADA')) motivos.unshift('Salió sin venta');
  return motivos;
}

export function esSalidaSinEnlazar(salida: Pick<ISalida, 'venta_item_id' | 'estado'>): boolean {
  return salida.estado === 'ACTIVA' && !salida.venta_item_id;
}
