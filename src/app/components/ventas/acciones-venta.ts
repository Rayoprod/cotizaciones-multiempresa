import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MenuItem, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TagModule } from 'primeng/tag';
import {
  CLAVE_BORRADOR_COTIZADOR, ETIQUETA_COBRO, ETIQUETA_ENTREGA, EstadoEntrega, IBorradorCotizador, IPago, IVenta, IVentaComprobante,
  METODOS_PAGO, MetodoPago, TipoComprobante, UNIDADES_COMUNES, cobradoSinFacturar, comprobanteDesdeArchivo, comprobantesVigentes,
  describirCambio, estadoCobro, etiquetaComprobante, facturadoDe, fechaCorta, fechaDeCotizacion, fechaIso, modoIgvDe,
  montoSugeridoFactura, resumenFacturado, severidadCobro, severidadEntrega, soles, textoCondicionPago
} from '../../models';
import { prepararArchivoComprobante } from '../../services/imagenes';
import { PdfService, lineasTotales } from '../../services/pdf.service';
import { SessionContextService } from '../../services/session-context.service';
import { SupabaseService } from '../../services/supabase.service';

const TEXTO_MARCAR: Record<EstadoEntrega, { label: string; icon: string }> = {
  PENDIENTE: { label: 'Marcar por entregar', icon: 'pi pi-clock' },
  PARCIAL: { label: 'Marcar entrega parcial', icon: 'pi pi-truck' },
  ENTREGADA: { label: 'Marcar entregada', icon: 'pi pi-check' }
};

/** Lo que el servidor rechaza por una regla ya viene en español; lo demás es de conexión. */
function mensajeDe(error: any, respaldo: string): string {
  return ['22023', 'P0001', '42501'].includes(error?.code) && error?.message ? error.message : respaldo;
}

/**
 * Todo lo que se puede hacer con una venta, con sus ventanas: lo usan la lista de
 * ventas y Por cobrar. Cada cambio del servidor se avisa con `actualizada`.
 */
@Component({
  selector: 'app-acciones-venta',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, InputTextareaModule, TagModule],
  templateUrl: './acciones-venta.html',
  styleUrl: './acciones-venta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccionesVentaComponent {
  @Output() actualizada = new EventEmitter<IVenta>();

  readonly soles = soles;
  readonly fechaCorta = fechaCorta;
  readonly textoCondicionPago = textoCondicionPago;
  readonly etiquetaComprobante = etiquetaComprobante;
  readonly resumenFacturado = resumenFacturado;
  readonly cobradoSinFacturar = cobradoSinFacturar;
  readonly describirCambio = describirCambio;
  readonly lineasTotales = lineasTotales;
  readonly metodos = METODOS_PAGO;
  readonly hoy = fechaIso();
  readonly opcionesEntrega: Array<{ value: EstadoEntrega; label: string }> = [
    { value: 'PENDIENTE', label: 'Por entregar' },
    { value: 'PARCIAL', label: 'Parcial' },
    { value: 'ENTREGADA', label: 'Entregada' }
  ];

  // Cada ventana conserva sus datos al cerrarse: si no, se vería vacía mientras se va.
  detalleAbierto = false;
  detalle: IVenta | null = null;
  descargando = false;
  cambiandoEntrega = false;

  pagoAbierto = false;
  ventaPago: IVenta | null = null;
  pago: { monto: number | null; metodo: MetodoPago | null; fecha: string; referencia: string; nota: string } = this.pagoVacio();
  mostrarFaltantesPago = false;

  comprobanteAbierto = false;
  ventaComprobante: IVenta | null = null;
  comprobante: { tipo: TipoComprobante; numero: string; monto: number | null; fecha: string } = this.comprobanteVacio();
  /** El archivo ya revisado, listo para subir al guardar. */
  archivoElegido: { contenido: Blob; extension: string; nombre: string } | null = null;
  mostrarFaltantesComprobante = false;
  /** La factura a la que se le sube un archivo desde el detalle. */
  comprobanteConArchivoNuevo: IVentaComprobante | null = null;
  subiendoArchivoDe: string | null = null;

  /** Anular siempre pide motivo: queda en el historial. */
  motivoAbierto = false;
  pedido: { titulo: string; mensaje: string; boton: string; ejecutar: (motivo: string) => Promise<IVenta>; exito: string } | null = null;
  motivo = '';

  guardando = false;

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private pdfSvc: PdfService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private session: SessionContextService
  ) {}

  get esAdmin(): boolean {
    return this.session.esAdminEmpresaActiva();
  }

  // ─── Menú ────────────────────────────────────────────────────────────────

  menuDe(venta: IVenta): MenuItem[] {
    const items: MenuItem[] = [{ label: 'Ver detalle', icon: 'pi pi-eye', command: () => this.verDetalle(venta) }];
    if (venta.estado !== 'ACTIVA') return items;

    if (this.puedePagar(venta)) {
      items.push({ label: 'Registrar pago', icon: 'pi pi-wallet', command: () => this.abrirPago(venta) });
    }
    items.push({ separator: true });
    for (const estado of ['PENDIENTE', 'PARCIAL', 'ENTREGADA'] as EstadoEntrega[]) {
      if (estado !== venta.estado_entrega) {
        items.push({ ...TEXTO_MARCAR[estado], command: () => this.marcarEntrega(venta, estado) });
      }
    }
    items.push({
      label: 'Agregar factura o boleta',
      icon: 'pi pi-receipt',
      command: () => this.abrirComprobante(venta)
    });
    if (this.esAdmin) {
      items.push({ separator: true });
      items.push({ label: 'Ajustar', icon: 'pi pi-pencil', command: () => this.ajustar(venta) });
      items.push({ label: 'Anular', icon: 'pi pi-times-circle', command: () => this.pedirAnularVenta(venta) });
    }
    return items;
  }

  puedePagar(venta: IVenta): boolean {
    return venta.estado === 'ACTIVA' && Number(venta.saldo) > 0;
  }

  // ─── Detalle ─────────────────────────────────────────────────────────────

  async verDetalle(venta: IVenta) {
    this.detalle = venta;
    this.detalleAbierto = true;
    this.cdr.markForCheck();
    if (venta.venta_cambios) return;
    try {
      const venta_cambios = await this.supabase.getCambiosVenta(venta.id);
      if (this.detalle?.id === venta.id) this.detalle = { ...this.detalle, venta_cambios };
    } catch (e) {
      // Sin historial el detalle sigue sirviendo.
      console.error('Error al cargar el historial de la venta:', e);
    }
    this.cdr.markForCheck();
  }

  cerrarDetalle() {
    this.detalleAbierto = false;
    this.cdr.markForCheck();
  }

  etiquetaCobro(venta: IVenta): string {
    return ETIQUETA_COBRO[estadoCobro(venta)];
  }

  severidadDeCobro(venta: IVenta) {
    return severidadCobro(estadoCobro(venta));
  }

  etiquetaEntrega(venta: IVenta): string {
    return ETIQUETA_ENTREGA[venta.estado_entrega];
  }

  severidadDeEntrega(venta: IVenta) {
    return severidadEntrega(venta.estado_entrega);
  }

  etiquetaMetodo(metodo: MetodoPago): string {
    return METODOS_PAGO.find(m => m.value === metodo)?.label ?? metodo;
  }

  etiquetaUnidad(unidad: string): string {
    return UNIDADES_COMUNES.find(u => u.value === unidad)?.label ?? unidad;
  }

  fechaHora(fecha: string): string {
    return fechaDeCotizacion(fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /** Cuándo se anotó, si no fue el mismo día de la venta: una deuda antigua se carga después. */
  registradaOtroDia(venta: IVenta): boolean {
    return !!venta.registrada_en && fechaIso(new Date(venta.registrada_en)) !== venta.fecha;
  }

  private aplicar(venta: IVenta) {
    if (this.detalle?.id === venta.id) this.detalle = venta;
    this.actualizada.emit(venta);
    this.cdr.markForCheck();
  }

  async descargarPdf(venta: IVenta) {
    const empresa = this.session.empresaActiva();
    if (!empresa || this.descargando) return;
    this.descargando = true;
    this.cdr.markForCheck();
    try {
      await this.pdfSvc.generarYDescargarOrdenVenta(venta, empresa);
    } catch (e) {
      console.error('Error al generar la orden de venta:', e);
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el PDF' });
    } finally {
      this.descargando = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Pagos ───────────────────────────────────────────────────────────────

  private pagoVacio() {
    return { monto: null as number | null, metodo: null as MetodoPago | null, fecha: fechaIso(), referencia: '', nota: '' };
  }

  abrirPago(venta: IVenta) {
    this.ventaPago = venta;
    this.pagoAbierto = true;
    this.pago = { ...this.pagoVacio(), monto: Number(venta.saldo) };
    this.mostrarFaltantesPago = false;
    this.cdr.markForCheck();
  }

  cerrarPago() {
    this.pagoAbierto = false;
    this.cdr.markForCheck();
  }

  get faltantesPago(): string[] {
    const falta: string[] = [];
    const monto = this.pago.monto ?? 0;
    if (monto <= 0) falta.push('el monto');
    if (this.ventaPago && monto > Number(this.ventaPago.saldo)) falta.push('un monto que no supere el saldo');
    if (!this.pago.metodo) falta.push('cómo se recibió');
    if (!this.pago.fecha) falta.push('la fecha');
    else if (this.pago.fecha > fechaIso()) falta.push('una fecha que no sea futura');
    return falta;
  }

  async registrarPago() {
    if (!this.ventaPago || this.guardando) return;
    if (this.faltantesPago.length) {
      this.mostrarFaltantesPago = true;
      this.cdr.markForCheck();
      return;
    }
    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const venta = await this.supabase.registrarPago(this.ventaPago.id, {
        monto: this.pago.monto!,
        metodo: this.pago.metodo!,
        fecha: this.pago.fecha,
        referencia: this.pago.referencia.trim() || null,
        nota: this.pago.nota.trim() || null
      });
      this.pagoAbierto = false;
      this.aplicar(venta);
      this.msg.add({
        severity: 'success', summary: 'Pago registrado',
        detail: Number(venta.saldo) > 0 ? `${venta.folio} queda debiendo ${soles(venta.saldo)}.` : `${venta.folio} quedó pagada.`
      });
    } catch (e: any) {
      console.error('Error al registrar el pago:', e);
      this.msg.add({ severity: 'error', summary: 'No se registró el pago', life: 8000, detail: mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') });
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  pedirAnularPago(venta: IVenta, pago: IPago) {
    this.pedirMotivo({
      titulo: 'Anular pago',
      mensaje: `El pago de ${soles(pago.monto)} del ${fechaCorta(pago.fecha)} deja de contar y ${venta.folio} vuelve a deber ese monto. Queda en el historial.`,
      boton: 'Anular pago',
      exito: 'Pago anulado',
      ejecutar: motivo => this.supabase.anularPago(pago.id, motivo)
    });
  }

  // ─── Entrega ─────────────────────────────────────────────────────────────

  async marcarEntrega(venta: IVenta, estado: EstadoEntrega) {
    if (estado === venta.estado_entrega || this.cambiandoEntrega) return;
    this.cambiandoEntrega = true;
    this.cdr.markForCheck();
    try {
      this.aplicar(await this.supabase.marcarEntregaVenta(venta.id, estado));
    } catch (e: any) {
      console.error('Error al marcar la entrega:', e);
      this.msg.add({ severity: 'error', summary: 'No se cambió la entrega', detail: mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') });
    } finally {
      this.cambiandoEntrega = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Facturas y boletas ──────────────────────────────────────────────────

  private comprobanteVacio() {
    return { tipo: 'FACTURA' as TipoComprobante, numero: '', monto: null as number | null, fecha: fechaIso() };
  }

  abrirComprobante(venta: IVenta) {
    this.ventaComprobante = venta;
    this.comprobanteAbierto = true;
    this.comprobante = {
      ...this.comprobanteVacio(),
      tipo: venta.cliente_documento.length === 8 ? 'BOLETA' : 'FACTURA',
      monto: montoSugeridoFactura(venta)
    };
    this.archivoElegido = null;
    this.mostrarFaltantesComprobante = false;
    this.cdr.markForCheck();
  }

  cerrarComprobante() {
    this.comprobanteAbierto = false;
    this.cdr.markForCheck();
  }

  /** Revisa el archivo al elegirlo: si no sirve, se sabe antes de guardar la factura. */
  async alElegirArchivo(event: Event) {
    const archivo = this.archivoDelInput(event);
    if (!archivo) return;
    try {
      this.archivoElegido = { ...await prepararArchivoComprobante(archivo), nombre: archivo.name };
      const sugerido = comprobanteDesdeArchivo(archivo.name);
      if (sugerido && !this.comprobante.numero.trim()) {
        this.comprobante = { ...this.comprobante, ...sugerido };
      }
    } catch (e: any) {
      this.msg.add({ severity: 'warn', summary: 'Ese archivo no sirve', detail: e?.message });
    }
    this.cdr.markForCheck();
  }

  quitarArchivoElegido() {
    this.archivoElegido = null;
    this.cdr.markForCheck();
  }

  /** Se vacía el input para que elegir de nuevo el mismo archivo también avise. */
  private archivoDelInput(event: Event): File | null {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    input.value = '';
    return archivo;
  }

  get faltantesComprobante(): string[] {
    const falta: string[] = [];
    if (!this.comprobante.numero.trim()) falta.push('el número');
    if ((this.comprobante.monto ?? 0) <= 0) falta.push('el monto');
    if (!this.comprobante.fecha) falta.push('la fecha');
    else if (this.comprobante.fecha > fechaIso()) falta.push('una fecha que no sea futura');
    return falta;
  }

  /** Con esta, lo facturado superaría el total. No se bloquea: se avisa. */
  get excesoDeFactura(): number {
    const venta = this.ventaComprobante;
    if (!venta?.incluye_igv) return 0;
    return Math.max(0, facturadoDe(venta) + (this.comprobante.monto ?? 0) - Number(venta.total));
  }

  async guardarComprobante() {
    if (!this.ventaComprobante || this.guardando) return;
    if (this.faltantesComprobante.length) {
      this.mostrarFaltantesComprobante = true;
      this.cdr.markForCheck();
      return;
    }
    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const numero = this.comprobante.numero.trim().toUpperCase();
      let venta = await this.supabase.agregarComprobanteVenta(this.ventaComprobante.id, {
        tipo: this.comprobante.tipo,
        numero,
        monto: this.comprobante.monto!,
        fecha: this.comprobante.fecha
      });
      if (this.archivoElegido) {
        const nuevo = venta.venta_comprobantes.find(c => !c.anulado && c.tipo === this.comprobante.tipo && c.numero === numero)!;
        try {
          venta = await this.subirYLigar(nuevo, this.archivoElegido);
        } catch (e) {
          // La factura ya quedó guardada: el archivo se puede subir después desde la venta.
          console.error('Error al subir el archivo:', e);
          this.msg.add({
            severity: 'warn', summary: `${etiquetaComprobante(nuevo)} guardada, sin archivo`, life: 8000,
            detail: 'El archivo no se subió. Inténtalo de nuevo desde el detalle de la venta.'
          });
        }
      }
      this.comprobanteAbierto = false;
      this.aplicar(venta);
    } catch (e: any) {
      console.error('Error al guardar el comprobante:', e);
      this.msg.add({ severity: 'error', summary: 'No se guardó', life: 8000, detail: mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') });
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  private async subirYLigar(comprobante: IVentaComprobante, archivo: { contenido: Blob; extension: string; nombre: string }): Promise<IVenta> {
    const ruta = await this.supabase.subirArchivoComprobante(comprobante, archivo.contenido, archivo.extension);
    return this.supabase.adjuntarArchivoComprobante(comprobante.id, ruta, archivo.nombre);
  }

  /** Subir el archivo de una factura que se guardó sin él. */
  elegirArchivoDe(comprobante: IVentaComprobante, input: HTMLInputElement) {
    this.comprobanteConArchivoNuevo = comprobante;
    input.click();
  }

  async alElegirArchivoNuevo(event: Event) {
    const archivo = this.archivoDelInput(event);
    const comprobante = this.comprobanteConArchivoNuevo;
    if (!archivo || !comprobante) return;
    this.subiendoArchivoDe = comprobante.id;
    this.cdr.markForCheck();
    try {
      const preparado = await prepararArchivoComprobante(archivo);
      this.aplicar(await this.subirYLigar(comprobante, { ...preparado, nombre: archivo.name }));
    } catch (e: any) {
      console.error('Error al subir el archivo:', e);
      this.msg.add({ severity: 'error', summary: 'No se subió el archivo', life: 8000, detail: e?.code ? mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') : e?.message });
    } finally {
      this.subiendoArchivoDe = null;
      this.cdr.markForCheck();
    }
  }

  async verArchivo(comprobante: IVentaComprobante) {
    // Se abre antes de pedir el enlace: después de esperar, el navegador la tomaría por una ventana emergente.
    const ventana = window.open('', '_blank');
    try {
      const url = await this.supabase.urlArchivoComprobante(comprobante.archivo_ruta!);
      if (ventana) ventana.location.href = url;
      else window.location.href = url;
    } catch (e) {
      console.error('Error al abrir el archivo:', e);
      ventana?.close();
      this.msg.add({ severity: 'error', summary: 'No se abrió el archivo', detail: 'Revisa tu conexión e inténtalo de nuevo.' });
    }
  }

  pedirAnularComprobante(comprobante: IVentaComprobante) {
    this.pedirMotivo({
      titulo: `Anular ${comprobante.tipo === 'BOLETA' ? 'boleta' : 'factura'}`,
      mensaje: `${etiquetaComprobante(comprobante)} por ${soles(comprobante.monto)} deja de contar como facturado. Su archivo se conserva. Si corresponde una nota de crédito, se emite en tu sistema.`,
      boton: 'Anular',
      exito: `${etiquetaComprobante(comprobante)} anulada`,
      ejecutar: motivo => this.supabase.anularComprobanteVenta(comprobante.id, motivo)
    });
  }

  // ─── Ajustar y anular (solo admin) ───────────────────────────────────────

  /** Se ajusta en el cotizador: las líneas se editan igual que al vender. */
  ajustar(venta: IVenta) {
    const borrador: IBorradorCotizador = {
      modo: 'ajuste',
      origen_id: venta.id,
      folio_origen: venta.folio,
      cliente_nombre: venta.cliente_nombre,
      cliente_documento: venta.cliente_documento,
      cliente_telefono: venta.cliente_telefono || '',
      cliente_direccion: venta.cliente_direccion || '',
      cliente_correo: venta.cliente_correo || '',
      observaciones: venta.observaciones || '',
      lugar_entrega: venta.lugar_entrega || null,
      modo_igv: modoIgvDe(venta),
      descuento: Number(venta.descuento_global) || 0,
      condiciones: venta.condiciones,
      items: venta.venta_items.map(i => ({
        id: i.id,
        sku: i.sku ?? undefined,
        descripcion: i.descripcion,
        unidad: i.unidad,
        cantidad: Number(i.cantidad),
        precio_unitario: Number(i.precio_unitario),
        subtotal: Number(i.importe)
      })),
      pagado: Number(venta.pagado),
      datos_venta: { fecha: venta.fecha, condicionPago: venta.condicion_pago, diasCredito: venta.dias_credito ?? null }
    };
    sessionStorage.setItem(CLAVE_BORRADOR_COTIZADOR, JSON.stringify(borrador));
    this.detalleAbierto = false;
    this.router.navigate(['/cotizador']);
  }

  pedirAnularVenta(venta: IVenta) {
    // Si tiene pagos, el servidor no deja anularla: se dice antes de pedir el motivo.
    if (Number(venta.pagado) > 0) {
      this.msg.add({
        severity: 'warn', summary: 'Tiene pagos vigentes', life: 8000,
        detail: `${venta.folio} tiene pagos por ${soles(venta.pagado)}. Anúlalos primero desde el detalle.`
      });
      this.verDetalle(venta);
      return;
    }
    const avisos = [
      venta.folio_cotizacion ? `La cotización ${venta.folio_cotizacion} vuelve a Pendiente.` : '',
      venta.estado_entrega !== 'PENDIENTE' ? 'Figura con material entregado: revisa cómo queda eso.' : '',
      comprobantesVigentes(venta).length ? 'Tiene facturas o boletas vigentes: revisa si toca una nota de crédito en tu sistema.' : ''
    ].filter(Boolean).join(' ');
    this.pedirMotivo({
      titulo: 'Anular venta',
      mensaje: `${venta.folio} quedará anulada y esto no se puede deshacer. ${avisos}`.trim(),
      boton: 'Anular venta',
      exito: `Venta ${venta.folio} anulada`,
      ejecutar: motivo => this.supabase.anularVenta(venta.id, motivo)
    });
  }

  private pedirMotivo(pedido: NonNullable<AccionesVentaComponent['pedido']>) {
    this.pedido = pedido;
    this.motivoAbierto = true;
    this.motivo = '';
    this.cdr.markForCheck();
  }

  cerrarMotivo() {
    this.motivoAbierto = false;
    this.cdr.markForCheck();
  }

  async confirmarMotivo() {
    if (!this.pedido || !this.motivo.trim() || this.guardando) return;
    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const venta = await this.pedido.ejecutar(this.motivo.trim());
      this.msg.add({ severity: 'success', summary: this.pedido.exito });
      this.motivoAbierto = false;
      this.aplicar(venta);
    } catch (e: any) {
      console.error('Error al anular:', e);
      this.msg.add({ severity: 'error', summary: 'No se anuló', life: 8000, detail: mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') });
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }
}
