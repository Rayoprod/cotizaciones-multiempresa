// src/app/models/venta.model.ts
import { ICondicionesPdf, fechaDeCotizacion, redondear2 } from './cotizacion.model';
import { UNIDADES_COMUNES, esUnidadDeServicio } from './producto.model';

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
  /** Lo que ya salió de la cantera; lo calculan las salidas. */
  entregado?: number;
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

/** Una factura o boleta de la venta. La app no las emite: las guarda para ubicarlas. */
export interface IVentaComprobante {
  id: string;
  venta_id: string;
  empresa_id: string;
  tipo: TipoComprobante;
  numero: string;
  fecha: string;
  monto: number;
  archivo_ruta?: string | null;
  archivo_nombre?: string | null;
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
  tipo: 'AJUSTE' | 'ANULACION' | 'ENTREGA' | 'COMPROBANTE' | 'PAGO_ANULADO' | 'COMPROBANTE_ANULADO'
    | 'SALIDAS_DETENIDAS' | 'SALIDAS_REANUDADAS' | 'SALIDA_ANULADA' | 'SALIDA_ENLAZADA' | 'SALIDA_MOVIDA';
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
  cotizacion_id?: string | null;
  folio_cotizacion?: string | null;
  vendedor?: string | null;
  vendedor_nombre?: string | null;
  anulada_en?: string | null;
  anulada_por_nombre?: string | null;
  motivo_anulacion?: string | null;
  /** Si tiene fecha, la oficina pidió no despachar: el encargado lo ve y, si sale igual, queda marcado. */
  salidas_detenidas_en?: string | null;
  salidas_detenidas_por_nombre?: string | null;
  motivo_detencion?: string | null;
  venta_items: IVentaItem[];
  pagos: IPago[];
  venta_comprobantes: IVentaComprobante[];
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

export function etiquetaComprobante(comprobante: Pick<IVentaComprobante, 'tipo' | 'numero'>): string {
  return `${comprobante.tipo === 'BOLETA' ? 'Boleta' : 'Factura'} ${comprobante.numero}`;
}

export function comprobantesVigentes(venta: Pick<IVenta, 'venta_comprobantes'>): IVentaComprobante[] {
  return (venta.venta_comprobantes ?? []).filter(c => !c.anulado);
}

/** "Factura F001-1" o "3 comprobantes": lo que cabe en una fila de la lista. */
export function resumenComprobantes(venta: Pick<IVenta, 'venta_comprobantes'>): string | null {
  const vigentes = comprobantesVigentes(venta);
  if (!vigentes.length) return null;
  return vigentes.length === 1 ? etiquetaComprobante(vigentes[0]) : `${vigentes.length} comprobantes`;
}

/** Todos los vigentes con su número, para el PDF y los CSV. */
export function textoComprobantes(venta: Pick<IVenta, 'venta_comprobantes'>): string | null {
  const vigentes = comprobantesVigentes(venta);
  return vigentes.length ? vigentes.map(etiquetaComprobante).join(', ') : null;
}

export function facturadoDe(venta: Pick<IVenta, 'venta_comprobantes'>): number {
  return redondear2(comprobantesVigentes(venta).reduce((suma, c) => suma + Number(c.monto), 0));
}

type DatosDeFacturacion = Pick<IVenta, 'estado' | 'incluye_igv' | 'total' | 'pagado' | 'venta_comprobantes'>;

/**
 * Cuánto falta facturar, o null si no se puede saber: en una venta sin IGV la
 * factura puede llevarlo encima del total, así que los montos no se comparan.
 */
export function faltaFacturar(venta: DatosDeFacturacion): number | null {
  if (venta.estado !== 'ACTIVA' || !venta.incluye_igv) return null;
  return Math.max(0, redondear2(Number(venta.total) - facturadoDe(venta)));
}

/** Lo cobrado que aún no tiene factura, como un adelanto. Null en lo mismo que faltaFacturar. */
export function cobradoSinFacturar(venta: DatosDeFacturacion): number | null {
  if (venta.estado !== 'ACTIVA' || !venta.incluye_igv) return null;
  return Math.max(0, redondear2(Number(venta.pagado) - facturadoDe(venta)));
}

/** Lo que se propone al agregar una: primero lo cobrado sin facturar; si no hay, lo que falta. */
export function montoSugeridoFactura(venta: DatosDeFacturacion): number | null {
  return cobradoSinFacturar(venta) || faltaFacturar(venta) || null;
}

/** Cómo va la facturación de la venta, en una línea. */
export function resumenFacturado(venta: DatosDeFacturacion): string | null {
  const facturado = facturadoDe(venta);
  const falta = faltaFacturar(venta);
  if (falta === null) return facturado > 0 ? `Facturado ${soles(facturado)}` : null;
  const total = Number(venta.total);
  if (facturado > total) return `Facturado ${soles(facturado)}: ${soles(redondear2(facturado - total))} más que el total`;
  if (falta === 0) return facturado > 0 ? `Facturado ${soles(facturado)}: completo` : null;
  return facturado > 0 ? `Facturado ${soles(facturado)} de ${soles(total)}. Falta ${soles(falta)}` : `Falta facturar ${soles(falta)}`;
}

/**
 * Los archivos de una factura electrónica suelen llamarse como su número
 * (20512345678-01-F001-00001234.pdf): así no hay que escribirlo.
 */
export function comprobanteDesdeArchivo(nombre: string): { tipo: TipoComprobante; numero: string } | null {
  const coincide = /(?:^|[^A-Z0-9])([FBE][A-Z0-9]{2}[0-9])[-_ ](\d{1,8})(?:[^0-9]|$)/i.exec(nombre);
  if (!coincide) return null;
  const serie = coincide[1].toUpperCase();
  return { tipo: /^(B|EB)/.test(serie) ? 'BOLETA' : 'FACTURA', numero: `${serie}-${coincide[2]}` };
}

function textoDeSalida(d: { cantidad?: number; unidad?: string; placa?: string }): string {
  const unidad = UNIDADES_COMUNES.find(u => u.value === d.unidad)?.label ?? d.unidad;
  return `${Number(d.cantidad).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unidad}, placa ${d.placa}`;
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
    case 'COMPROBANTE':
      return d.despues?.numero ? `Comprobante: ${etiquetaComprobante(d.despues)}` : 'Se quitó el comprobante';
    case 'COMPROBANTE_ANULADO':
      return `${etiquetaComprobante(d)} anulada`;
    case 'PAGO_ANULADO':
      return `Pago de ${soles(d.monto)} anulado`;
    case 'SALIDAS_DETENIDAS':
      return 'Salidas detenidas';
    case 'SALIDAS_REANUDADAS':
      return 'Salidas reanudadas';
    case 'SALIDA_ANULADA':
      return `Salida anulada: ${textoDeSalida(d)}`;
    case 'SALIDA_ENLAZADA':
      return `Salida enlazada: ${textoDeSalida(d)}`;
    case 'SALIDA_MOVIDA':
      return `Salida pasada a ${d.hacia}: ${textoDeSalida(d)}`;
    default:
      return cambio.tipo;
  }
}

type DatosDeEntrega = Pick<IVenta, 'venta_items'>;

/** Tiene salidas registradas: la entrega ya no se marca a mano. */
export function tieneEntregaCalculada(venta: DatosDeEntrega): boolean {
  return (venta.venta_items ?? []).some(i => Number(i.entregado) > 0);
}

/** Lo que vale lo que ya salió, con su parte de descuento e IGV: es lo que se compara con lo pagado. */
export function valorEntregado(venta: DatosDeEntrega & Pick<IVenta, 'subtotal' | 'total'>): number {
  const subtotal = Number(venta.subtotal);
  if (subtotal <= 0) return 0;
  const salido = (venta.venta_items ?? []).reduce((suma, i) => suma + Number(i.entregado ?? 0) * Number(i.precio_unitario), 0);
  return redondear2(Number(venta.total) * salido / subtotal);
}

/**
 * Lo más delicado: el material ya salió y falta el dinero. Una venta marcada a mano
 * como entregada no tiene cantidades, así que cuenta por su total.
 */
export function entregadoSinPagarDe(venta: DatosDeEntrega & Pick<IVenta, 'estado' | 'estado_entrega' | 'subtotal' | 'total' | 'pagado'>): number {
  if (venta.estado !== 'ACTIVA') return 0;
  const valor = tieneEntregaCalculada(venta)
    ? valorEntregado(venta)
    : venta.estado_entrega === 'ENTREGADA' ? Number(venta.total) : 0;
  return Math.max(0, redondear2(valor - Number(venta.pagado)));
}

/** "Faltan 55 m³", "Faltan 55 m³ y 20 bolsa": lo que queda por salir, sin los servicios. */
export function textoFaltanteVenta(venta: DatosDeEntrega): string | null {
  const porUnidad = new Map<string, number>();
  for (const i of venta.venta_items ?? []) {
    const falta = Number(i.cantidad) - Number(i.entregado ?? 0);
    if (falta > 0 && !esUnidadDeServicio(i.unidad)) porUnidad.set(i.unidad, (porUnidad.get(i.unidad) ?? 0) + falta);
  }
  if (!porUnidad.size) return null;
  return 'Faltan ' + [...porUnidad].map(([unidad, falta]) =>
    `${falta.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${UNIDADES_COMUNES.find(u => u.value === unidad)?.label ?? unidad}`
  ).join(' y ');
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
