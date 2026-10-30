// src/app/models/venta.model.ts
import { ICondicionesPdf, fechaDeCotizacion, redondear2 } from './cotizacion.model';

export type EstadoVenta = 'ACTIVA' | 'ANULADA';
export type EstadoEntrega = 'PENDIENTE' | 'PARCIAL' | 'ENTREGADA';
export type CondicionPago = 'CONTADO' | 'CREDITO';
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'YAPE_PLIN' | 'CHEQUE' | 'OTRO';
export type TipoComprobante = 'FACTURA' | 'BOLETA';
/** Cómo va el cobro. Se calcula: ni Vencida ni Pagada se guardan. */
export type EstadoCobro = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA' | 'ANULADA';

export const METODOS_PAGO: Array<{ label: string; value: MetodoPago }> = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Depósito', value: 'DEPOSITO' },
  { label: 'Yape o Plin', value: 'YAPE_PLIN' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Otro', value: 'OTRO' }
];

export const ETIQUETA_ENTREGA: Record<EstadoEntrega, string> = {
  PENDIENTE: 'Por entregar',
  PARCIAL: 'Entrega parcial',
  ENTREGADA: 'Entregada'
};

export const ETIQUETA_COBRO: Record<EstadoCobro, string> = {
  PENDIENTE: 'Por cobrar',
  PARCIAL: 'Pago parcial',
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
  ANULADA: 'Anulada'
};

export interface IVentaItem {
  id?: string;
  sku?: string | null;
  producto_id?: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  orden?: number;
}

export interface IPago {
  id: string;
  venta_id: string;
  empresa_id: string;
  fecha: string;
  monto: number;
  metodo: MetodoPago;
  referencia?: string | null;
  nota?: string | null;
  registrado_en: string;
  creado_por_nombre?: string | null;
  anulado: boolean;
  anulado_en?: string | null;
  anulado_por_nombre?: string | null;
  motivo_anulacion?: string | null;
}

export interface IVentaCambio {
  id: string;
  fecha: string;
  usuario_nombre?: string | null;
  tipo: 'AJUSTE' | 'ANULACION' | 'ENTREGA' | 'COMPROBANTE' | 'PAGO_ANULADO';
  detalle: any;
  motivo?: string | null;
}

export interface IVenta {
  id: string;
  folio: string;
  fecha: string;
  registrada_en?: string;
  empresa_id: string;
  estado: EstadoVenta;
  estado_entrega: EstadoEntrega;
  cliente_id?: string | null;
  cliente_nombre: string;
  cliente_documento: string;
  cliente_telefono?: string | null;
  cliente_direccion?: string | null;
  cliente_correo?: string | null;
  subtotal: number;
  descuento_global: number;
  igv: number;
  total: number;
  incluye_igv: boolean;
  precios_con_igv: boolean;
  pagado: number;
  saldo: number;
  condicion_pago: CondicionPago;
  dias_credito?: number | null;
  vence_el?: string | null;
  lugar_entrega?: string | null;
  observaciones?: string | null;
  condiciones?: Partial<ICondicionesPdf>;
  comprobante_tipo?: TipoComprobante | null;
  comprobante_numero?: string | null;
  cotizacion_id?: string | null;
  folio_cotizacion?: string | null;
  vendedor?: string | null;
  vendedor_nombre?: string | null;
  anulada_en?: string | null;
  anulada_por_nombre?: string | null;
  motivo_anulacion?: string | null;
  venta_items: IVentaItem[];
  pagos: IPago[];
  /** Solo llega con las operaciones sobre una venta; la lista no lo trae. */
  venta_cambios?: IVentaCambio[];
}

/** Lo que una venta pide además de lo que ya pide una cotización. */
export interface IDatosVenta {
  fecha: string;
  condicionPago: CondicionPago;
  diasCredito: number | null;
  estadoEntrega: EstadoEntrega;
  /** Lo que se recibió al vender; 0 o vacío si no se recibió nada. */
  adelantoMonto: number | null;
  adelantoMetodo: MetodoPago | null;
  adelantoReferencia: string;
}

export function fechaIso(fecha: Date = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function datosVentaIniciales(hoy: Date = new Date()): IDatosVenta {
  return {
    fecha: fechaIso(hoy),
    condicionPago: 'CONTADO',
    diasCredito: null,
    estadoEntrega: 'PENDIENTE',
    adelantoMonto: null,
    adelantoMetodo: null,
    adelantoReferencia: ''
  };
}

/** El adelanto como lo espera el servidor, o null si no se recibió nada. */
export function adelantoDe(datos: IDatosVenta): { monto: number; metodo: MetodoPago; referencia: string | null } | null {
  if (!datos.adelantoMonto || datos.adelantoMonto <= 0 || !datos.adelantoMetodo) return null;
  return {
    monto: datos.adelantoMonto,
    metodo: datos.adelantoMetodo,
    referencia: datos.adelantoReferencia.trim() || null
  };
}

export function esDocumentoValido(documento: string | null | undefined): boolean {
  return /^(\d{8}|\d{11})$/.test(String(documento ?? '').trim());
}

/** Lo que falta para registrar la venta, en palabras. El servidor valida lo mismo. */
export function faltantesDatosVenta(datos: IDatosVenta, total: number, hoy: Date = new Date()): string[] {
  const falta: string[] = [];
  if (!datos.fecha) falta.push('la fecha de la venta');
  else if (datos.fecha > fechaIso(hoy)) falta.push('una fecha que no sea futura');

  const dias = datos.diasCredito;
  if (datos.condicionPago === 'CREDITO' && dias !== null && !(Number.isInteger(dias) && dias >= 1 && dias <= 365)) {
    falta.push('días de crédito entre 1 y 365');
  }

  const monto = datos.adelantoMonto ?? 0;
  if (monto > total) falta.push('un monto recibido que no supere el total');
  if (monto > 0 && !datos.adelantoMetodo) falta.push('cómo se recibió el pago');
  return falta;
}

/** Sin hora: dos fechas del mismo día son iguales. */
function soloDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

/** Tiene saldo y ya pasó su vencimiento. Un crédito sin fecha nunca se vence solo. */
export function estaVencidaVenta(venta: Pick<IVenta, 'estado' | 'saldo' | 'vence_el'>, hoy: Date = new Date()): boolean {
  if (venta.estado !== 'ACTIVA' || Number(venta.saldo) <= 0 || !venta.vence_el) return false;
  return soloDia(hoy) > fechaDeCotizacion(venta.vence_el);
}

export function diasDeAtraso(venta: Pick<IVenta, 'estado' | 'saldo' | 'vence_el'>, hoy: Date = new Date()): number {
  if (!estaVencidaVenta(venta, hoy)) return 0;
  return Math.round((soloDia(hoy).getTime() - fechaDeCotizacion(venta.vence_el!).getTime()) / 86400000);
}

export function estadoCobro(venta: Pick<IVenta, 'estado' | 'saldo' | 'pagado' | 'vence_el'>, hoy: Date = new Date()): EstadoCobro {
  if (venta.estado === 'ANULADA') return 'ANULADA';
  if (Number(venta.saldo) <= 0) return 'PAGADA';
  if (estaVencidaVenta(venta, hoy)) return 'VENCIDA';
  return Number(venta.pagado) > 0 ? 'PARCIAL' : 'PENDIENTE';
}

export function severidadCobro(estado: EstadoCobro): 'success' | 'info' | 'warning' | 'danger' | 'secondary' {
  switch (estado) {
    case 'PAGADA': return 'success';
    case 'PARCIAL': return 'info';
    case 'PENDIENTE': return 'warning';
    case 'VENCIDA': return 'danger';
    default: return 'secondary';
  }
}

export function severidadEntrega(estado: EstadoEntrega): 'success' | 'info' | 'warning' {
  if (estado === 'ENTREGADA') return 'success';
  return estado === 'PARCIAL' ? 'info' : 'warning';
}

export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  return fechaDeCotizacion(fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function soles(monto: number): string {
  return `S/ ${Number(monto).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Contado", "Crédito" o "Crédito a 30 días, vence el 30/11/2026". */
export function textoCondicionPago(venta: Pick<IVenta, 'condicion_pago' | 'dias_credito' | 'vence_el'>): string {
  if (venta.condicion_pago !== 'CREDITO') return 'Contado';
  if (!venta.dias_credito || !venta.vence_el) return 'Crédito';
  return `Crédito a ${venta.dias_credito} días, vence el ${fechaCorta(venta.vence_el)}`;
}

export function textoComprobante(venta: Pick<IVenta, 'comprobante_tipo' | 'comprobante_numero'>): string | null {
  if (!venta.comprobante_numero) return null;
  return `${venta.comprobante_tipo === 'BOLETA' ? 'Boleta' : 'Factura'} ${venta.comprobante_numero}`;
}

/** Lo que dice el historial de la venta sobre un cambio. */
export function describirCambio(cambio: Pick<IVentaCambio, 'tipo' | 'detalle'>): string {
  const d = cambio.detalle ?? {};
  switch (cambio.tipo) {
    case 'AJUSTE': {
      const antes = Number(d.antes?.total), despues = Number(d.despues?.total);
      return antes === despues ? 'Ajuste sin cambio de total' : `Ajuste: total de ${soles(antes)} a ${soles(despues)}`;
    }
    case 'ANULACION':
      return 'Venta anulada';
    case 'ENTREGA':
      return `Entrega: ${ETIQUETA_ENTREGA[d.antes as EstadoEntrega] ?? d.antes} → ${ETIQUETA_ENTREGA[d.despues as EstadoEntrega] ?? d.despues}`;
    case 'COMPROBANTE': {
      const texto = textoComprobante({ comprobante_tipo: d.despues?.tipo, comprobante_numero: d.despues?.numero });
      return texto ? `Comprobante: ${texto}` : 'Se quitó el comprobante';
    }
    case 'PAGO_ANULADO':
      return `Pago de ${soles(d.monto)} anulado`;
    default:
      return cambio.tipo;
  }
}

/** Todo lo que debe un cliente. Se agrupa por documento: el cliente puede haber salido de la cartera. */
export interface IDeudaCliente {
  documento: string;
  nombre: string;
  telefono: string | null;
  saldo: number;
  vencido: number;
  mayorAtraso: number;
  /** De lo más antiguo a lo más nuevo: es lo primero que se cobra. */
  ventas: IVenta[];
}

export function deudasPorCliente(ventas: IVenta[], hoy: Date = new Date()): IDeudaCliente[] {
  const porDocumento = new Map<string, IDeudaCliente>();
  const conSaldo = ventas
    .filter(v => v.estado === 'ACTIVA' && Number(v.saldo) > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  for (const venta of conSaldo) {
    const deuda = porDocumento.get(venta.cliente_documento) ?? {
      documento: venta.cliente_documento, nombre: venta.cliente_nombre, telefono: null,
      saldo: 0, vencido: 0, mayorAtraso: 0, ventas: []
    };
    // De lo más antiguo a lo más nuevo: quedan el nombre y el teléfono más recientes.
    deuda.nombre = venta.cliente_nombre;
    deuda.telefono = venta.cliente_telefono || deuda.telefono;
    deuda.saldo = redondear2(deuda.saldo + Number(venta.saldo));
    if (estaVencidaVenta(venta, hoy)) deuda.vencido = redondear2(deuda.vencido + Number(venta.saldo));
    deuda.mayorAtraso = Math.max(deuda.mayorAtraso, diasDeAtraso(venta, hoy));
    deuda.ventas.push(venta);
    porDocumento.set(venta.cliente_documento, deuda);
  }

  return [...porDocumento.values()].sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
}

/** Lo cobrado en el mes de `hoy`, por la fecha del pago; lo anulado no cuenta. */
export function cobradoEnElMes(ventas: Array<Pick<IVenta, 'pagos'>>, hoy: Date = new Date()): number {
  const mes = fechaIso(hoy).slice(0, 7);
  return redondear2(ventas
    .flatMap(v => v.pagos ?? [])
    .filter(p => !p.anulado && p.fecha.slice(0, 7) === mes)
    .reduce((suma, p) => suma + Number(p.monto), 0));
}
