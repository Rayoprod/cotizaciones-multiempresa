// src/app/models/cotizacion.model.ts
import { EstadoCotizacion } from './types';

/** Debe coincidir con c_tasa_igv en crear_cotizacion(). */
export const TASA_IGV = 0.18;

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
  estado?: EstadoCotizacion;
  items: ICotizacionItem[];
  vendedor?: string;
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
  incluyeIgv: boolean;
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
  incluye_igv: boolean;
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

/** Mismo cálculo que crear_cotizacion(), para mostrar los totales mientras se edita. */
export function calcularTotales(
  items: Array<{ cantidad: number | null | undefined; precio_unitario: number | null | undefined }>,
  incluyeIgv: boolean
): { subtotal: number; igv: number; total: number } {
  const subtotal = redondear2(items.reduce(
    (suma, item) => suma + redondear2((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0)),
    0
  ));
  const igv = incluyeIgv ? redondear2(subtotal * TASA_IGV) : 0;
  return { subtotal, igv, total: redondear2(subtotal + igv) };
}
