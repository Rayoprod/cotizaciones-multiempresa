// src/app/models/cotizacion.model.ts
import { EstadoCotizacion, ModoIgv } from './types';

/** Debe coincidir con c_tasa_igv en crear_cotizacion(). */
export const TASA_IGV = 0.18;

/** Validez que imprime una cotización que no guardó sus condiciones. */
export const DIAS_VALIDEZ_POR_DEFECTO = 15;

/** Opciones del selector de IGV del cotizador y de la ficha de la empresa. */
export const MODOS_IGV: Array<{ label: string; value: ModoIgv; ayuda: string }> = [
  { label: 'Sumar IGV', value: 'sumar', ayuda: 'Escribe los precios sin IGV: se suma el 18% al total.' },
  { label: 'Ya incluyen IGV', value: 'incluido', ayuda: 'Escribe los precios con IGV: el PDF avisará que ya lo incluyen.' },
  { label: 'Sin IGV', value: 'sin_igv', ayuda: 'No se cobra IGV: el PDF avisará que los precios no lo incluyen.' }
];

export type TipoOrigenCotizacion = 'revision' | 'duplicado';

export interface ICotizacionItem {
  sku?: string;
  descripcion: string;
  unidad?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

/** Opciones del PDF que se guardan con la cotización. */
export interface ICondicionesPdf {
  mostrarValidez: boolean;
  diasValidez: number;
  mostrarCuentas: boolean;
  mostrarContacto: boolean;
}

export interface ICotizacion {
  id?: string;
  folio: string;
  fecha?: string;
  empresa_id: string;
  cliente_id?: string | null;
  cliente_nombre: string;
  cliente_documento: string;
  subtotal: number;
  igv: number;
  total: number;
  incluye_igv?: boolean;
  precios_con_igv?: boolean;
  descuento_global?: number;
  estado?: EstadoCotizacion;
  items: ICotizacionItem[];
  vendedor?: string;
  /** Nombre que imprime el PDF; `vendedor` guarda el correo y no se imprime. */
  vendedor_nombre?: string | null;
  estado_cambiado_en?: string | null;
  estado_cambiado_por_nombre?: string | null;
  lugar_entrega?: string | null;
  observaciones?: string | null;
  condiciones?: Partial<ICondicionesPdf>;
  cliente_telefono?: string | null;
  cliente_direccion?: string | null;
  cliente_correo?: string | null;
  oculta?: boolean;
  cotizacion_origen_id?: string | null;
  tipo_origen?: TipoOrigenCotizacion | null;
  folio_origen?: string | null;
  creado_por?: string | null;
}

/** Lo que el cotizador envía a crear_cotizacion(); el servidor pone folio y totales. */
export interface INuevaCotizacion {
  empresaId: string;
  cliente: {
    nombre: string;
    documento: string;
    telefono?: string | null;
    direccion?: string | null;
    correo?: string | null;
  };
  items: Array<Pick<ICotizacionItem, 'descripcion' | 'cantidad' | 'precio_unitario'> & { sku?: string | null; unidad?: string | null }>;
  modoIgv: ModoIgv;
  descuento: number;
  lugarEntrega?: string | null;
  observaciones?: string | null;
  condiciones: ICondicionesPdf;
  origen?: { id: string; tipo: TipoOrigenCotizacion } | null;
  guardarCliente: boolean;
}

/** Clave de sessionStorage con la que el historial abre el cotizador con datos. */
export const CLAVE_BORRADOR_COTIZADOR = 'cotizador-borrador';

export interface IBorradorCotizador {
  modo: 'revision' | 'duplicar';
  origen_id: string | null;
  folio_origen: string | null;
  cliente_nombre: string;
  cliente_documento: string;
  cliente_telefono: string;
  cliente_direccion: string;
  cliente_correo: string;
  observaciones: string;
  lugar_entrega: string | null;
  modo_igv: ModoIgv;
  descuento: number;
  condiciones?: Partial<ICondicionesPdf>;
  items: ICotizacionItem[];
}

/**
 * Redondeo a 2 decimales "mitad hacia arriba", como round() de Postgres.
 * Math.round(x * 100) / 100 falla con valores como 1.005 (da 1.00).
 */
export function redondear2(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const signo = valor < 0 ? -1 : 1;
  const absoluto = Math.abs(valor);
  const texto = absoluto.toPrecision(15);
  if (texto.includes('e')) return signo * Math.round(absoluto * 100) / 100;
  return signo * Number(Math.round(Number(`${texto}e2`)) + 'e-2');
}

/** El modo de una cotización guardada. Las anteriores solo guardaban incluye_igv (o ni eso). */
export function modoIgvDe(cotizacion: Pick<ICotizacion, 'incluye_igv' | 'igv' | 'precios_con_igv'>): ModoIgv {
  if (cotizacion.precios_con_igv) return 'incluido';
  return (cotizacion.incluye_igv ?? Number(cotizacion.igv) > 0) ? 'sumar' : 'sin_igv';
}

/**
 * Mismo cálculo que crear_cotizacion(), para mostrar los totales mientras se
 * edita. El servidor rechaza un descuento mayor al subtotal; aquí el total no
 * baja de 0 mientras se corrige.
 */
export function calcularTotales(
  items: Array<{ cantidad: number | null | undefined; precio_unitario: number | null | undefined }>,
  modo: ModoIgv,
  descuento: number | null | undefined = 0
): { subtotal: number; descuento: number; igv: number; total: number } {
  const subtotal = redondear2(items.reduce(
    (suma, item) => suma + redondear2((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0)),
    0
  ));
  const monto = redondear2(Number(descuento) || 0);
  const neto = Math.max(0, redondear2(subtotal - monto));
  if (modo === 'incluido') {
    return { subtotal, descuento: monto, igv: redondear2(neto * TASA_IGV / (1 + TASA_IGV)), total: neto };
  }
  if (modo === 'sumar') {
    const igv = redondear2(neto * TASA_IGV);
    return { subtotal, descuento: monto, igv, total: redondear2(neto + igv) };
  }
  return { subtotal, descuento: monto, igv: 0, total: neto };
}

/** Fecha de una cotización como fecha local; las viejas guardan solo AAAA-MM-DD. */
export function fechaDeCotizacion(fecha: string): Date {
  return new Date(fecha.includes('T') ? fecha : fecha.replace(/-/g, '/'));
}

/**
 * Último día en que vale la oferta, o null si no se imprimió validez. Casi todas
 * las cotizaciones anteriores no guardaron sus condiciones: se asume la validez
 * por defecto, que es la que salió en su PDF salvo que la hayan cambiado a mano.
 */
export function venceEl(cotizacion: Pick<ICotizacion, 'fecha' | 'condiciones'>): Date | null {
  if (!cotizacion.fecha || cotizacion.condiciones?.mostrarValidez === false) return null;
  const dias = Number(cotizacion.condiciones?.diasValidez) || DIAS_VALIDEZ_POR_DEFECTO;
  const emitida = fechaDeCotizacion(cotizacion.fecha);
  return new Date(emitida.getFullYear(), emitida.getMonth(), emitida.getDate() + dias);
}

/** Pendiente con la validez ya pasada. Se calcula: el estado sigue siendo PENDIENTE. */
export function estaVencida(
  cotizacion: Pick<ICotizacion, 'estado' | 'fecha' | 'condiciones'>,
  hoy: Date = new Date()
): boolean {
  if (cotizacion.estado !== 'PENDIENTE') return false;
  const limite = venceEl(cotizacion);
  if (!limite) return false;
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) > limite;
}
