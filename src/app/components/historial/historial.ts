import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';
import { SessionContextService } from '../../services/session-context.service';
import {
  ICotizacion, IBorradorCotizador, CLAVE_BORRADOR_COTIZADOR, ModoIgv,
  estaVencida, fechaDeCotizacion, modoIgvDe, venceEl,
  extraerNombreClienteTexto, extraerDocumentoClienteTexto
} from '../../models';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Menu, MenuModule } from 'primeng/menu';

/** El estado como se muestra: una Pendiente con la validez pasada se ve como Vencida. */
export type EstadoVisible = 'PENDIENTE' | 'VENCIDA' | 'APROBADA' | 'ANULADA';
export type FiltroEstado = 'TODAS' | EstadoVisible;
type EstadoDestino = 'PENDIENTE' | 'APROBADA' | 'ANULADA';

const ETIQUETA_ESTADO: Record<EstadoVisible, string> = {
  PENDIENTE: 'Pendiente',
  VENCIDA: 'Vencida',
  APROBADA: 'Aprobada',
  ANULADA: 'Anulada'
};

const ETIQUETA_IGV: Record<ModoIgv, string> = {
  sumar: 'IGV sumado',
  incluido: 'IGV incluido',
  sin_igv: 'Sin IGV'
};

const CONFIRMACION_ESTADO: Record<EstadoDestino, {
  titulo: string;
  mensaje: (folio: string) => string;
  aceptar: string;
  icono: string;
  claseBoton: string;
}> = {
  APROBADA: {
    titulo: 'Marcar como Aprobada',
    mensaje: folio => `${folio} contará como venta. Ya no se podrá revisar: solo duplicar o volver a Pendiente.`,
    aceptar: 'Sí, aprobar',
    icono: 'pi pi-check-circle',
    claseBoton: 'p-button-success'
  },
  PENDIENTE: {
    titulo: 'Volver a Pendiente',
    mensaje: folio => `${folio} saldrá de "Vendido" y se podrá revisar de nuevo.`,
    aceptar: 'Sí, volver a Pendiente',
    icono: 'pi pi-undo',
    claseBoton: 'p-button-warning'
  },
  ANULADA: {
    titulo: 'Anular cotización',
    mensaje: folio => `${folio} quedará anulada y esto no se puede deshacer. Si la necesitas de nuevo, podrás duplicarla.`,
    aceptar: 'Sí, anular',
    icono: 'pi pi-times-circle',
    claseBoton: 'p-button-danger'
  }
};

export function estadoVisible(cot: ICotizacion, hoy: Date = new Date()): EstadoVisible {
  if (estaVencida(cot, hoy)) return 'VENCIDA';
  return (cot.estado as EstadoVisible) ?? 'PENDIENTE';
}

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    TagModule,
    TooltipModule,
    ConfirmDialogModule,
    MenuModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './historial.html',
  styleUrls: ['./historial.scss']
})
export class HistorialComponent implements OnInit {
  cotizaciones: ICotizacion[] = [];
  cotizacionesFiltradas: ICotizacion[] = [];
  empresaActiva: any = null;

  descargando: string | null = null;
  cargando = true;

  mostrarOcultas = false;
  cantidadOcultas = 0;

  /** id de la cotización original → folio de la revisión que la reemplazó. */
  private reemplazos = new Map<string, string>();

  terminoBusqueda = '';
  fechaDesde = '';
  fechaHasta = '';
  filtroEstado: FiltroEstado = 'TODAS';

  readonly filtros: Array<{ value: FiltroEstado; label: string }> = [
    { value: 'TODAS', label: 'Todas' },
    { value: 'PENDIENTE', label: 'Pendientes' },
    { value: 'VENCIDA', label: 'Vencidas' },
    { value: 'APROBADA', label: 'Aprobadas' },
    { value: 'ANULADA', label: 'Anuladas' }
  ];
  conteos: Record<FiltroEstado, number> = { TODAS: 0, PENDIENTE: 0, VENCIDA: 0, APROBADA: 0, ANULADA: 0 };

  totalVendido = 0;
  totalPorCobrar = 0;
  tasaConversion = 0;

  /** Acciones de la cotización cuyo menú está abierto. */
  accionesMenu: MenuItem[] = [];

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private pdfSvc: PdfService,
    private cdr: ChangeDetectorRef,
    private confirmSvc: ConfirmationService,
    private router: Router,
    private session: SessionContextService
  ) {}

  async ngOnInit() {
    await this.cargarDatos();
  }

  async cargarDatos() {
    this.cargando = true;
    try {
      this.empresaActiva = this.session.empresaActiva();
      if (!this.empresaActiva) {
        this.router.navigate(['/selector']);
        return;
      }
      // Siempre todas: así se sabe cuántas ocultas hay sin otro pedido.
      const data = await this.supabase.getHistorial(this.empresaActiva.id, true);
      this.cotizaciones = (data || []).map((c: ICotizacion) => ({ ...c, oculta: c.oculta ?? false }));
      this.reemplazos = new Map(
        this.cotizaciones
          .filter(c => c.tipo_origen === 'revision' && c.cotizacion_origen_id)
          .map(c => [c.cotizacion_origen_id!, c.folio])
      );
      this.aplicarFiltros();
    } catch (error: any) {
      console.error('Error cargando historial:', error);
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el historial de cotizaciones' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  onToggleOcultas() {
    this.mostrarOcultas = !this.mostrarOcultas;
    this.aplicarFiltros();
  }

  // ─── Nombres ──────────────────────────────────────────────────────────────

  obtenerNombreCliente(cot: any): string {
    const val = cot?.cliente_nombre || cot?.clientenombre || cot?.clienteNombre || cot?.nombre_razon_social || cot?.nombre;
    const res = extraerNombreClienteTexto(val);
    return res || 'Sin nombre';
  }

  obtenerDocumentoCliente(cot: any): string {
    const val = cot?.cliente_documento || cot?.clientedocumento || cot?.clienteDocumento || cot?.documento_identidad;
    return extraerDocumentoClienteTexto(val);
  }

  // ─── Filtros y KPIs ───────────────────────────────────────────────────────

  filtrarCotizaciones(_termino: string) { this.aplicarFiltros(); }
  aplicarFiltroFecha()                   { this.aplicarFiltros(); }

  elegirFiltroEstado(filtro: FiltroEstado) {
    this.filtroEstado = filtro;
    this.aplicarFiltros();
  }

  get hayFiltros(): boolean {
    return !!this.terminoBusqueda.trim() || !!this.fechaDesde || !!this.fechaHasta || this.filtroEstado !== 'TODAS';
  }

  limpiarFiltros() {
    this.terminoBusqueda = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.filtroEstado = 'TODAS';
    this.aplicarFiltros();
  }

  private aplicarFiltros() {
    this.cantidadOcultas = this.cotizaciones.filter(c => c.oculta === true).length;
    let base = [...this.cotizaciones];

    if (!this.mostrarOcultas) {
      base = base.filter(cot => !cot.oculta);
    }

    if (this.terminoBusqueda.trim()) {
      const term = this.terminoBusqueda.toLowerCase().trim();
      base = base.filter(cot =>
        (cot.folio              || '').toLowerCase().includes(term) ||
        (cot.cliente_nombre     || '').toLowerCase().includes(term) ||
        (cot.cliente_documento  || '').toLowerCase().includes(term)
      );
    }

    if (this.fechaDesde) {
      const desde = new Date(this.fechaDesde + 'T00:00:00');
      base = base.filter(cot => cot.fecha && fechaDeCotizacion(cot.fecha) >= desde);
    }

    if (this.fechaHasta) {
      const hasta = new Date(this.fechaHasta + 'T23:59:59');
      base = base.filter(cot => cot.fecha && fechaDeCotizacion(cot.fecha) <= hasta);
    }

    // Conteos y KPIs no dependen del filtro de estado: elegir "Aprobadas" no
    // debe dejar en cero lo que hay por cobrar.
    this.calcularKPIs(base);
    this.cotizacionesFiltradas = this.filtroEstado === 'TODAS'
      ? base
      : base.filter(cot => estadoVisible(cot) === this.filtroEstado);
    this.cdr.markForCheck();
  }

  private calcularKPIs(base: ICotizacion[]) {
    const conteos: Record<FiltroEstado, number> = { TODAS: base.length, PENDIENTE: 0, VENCIDA: 0, APROBADA: 0, ANULADA: 0 };
    let vendido = 0;
    let porCobrar = 0;
    for (const cot of base) {
      const estado = estadoVisible(cot);
      conteos[estado]++;
      if (estado === 'APROBADA') vendido += cot.total || 0;
      if (estado === 'PENDIENTE') porCobrar += cot.total || 0;
    }
    this.conteos = conteos;
    this.totalVendido = vendido;
    this.totalPorCobrar = porCobrar;
    const noAnuladas = base.length - conteos.ANULADA;
    this.tasaConversion = noAnuladas > 0 ? (conteos.APROBADA / noAnuladas) * 100 : 0;
  }

  // ─── Exportar ─────────────────────────────────────────────────────────────

  exportarCSV() {
    if (!this.cotizacionesFiltradas.length) {
      this.msg.add({ severity: 'warn', summary: 'Sin datos', detail: 'No hay cotizaciones para exportar' });
      return;
    }
    const headers = ['Folio', 'Fecha', 'Cliente', 'Documento', 'Subtotal', 'Descuento', 'IGV', 'Total', 'Impuestos', 'Estado', 'Vendedor'];
    const rows = this.cotizacionesFiltradas.map(cot => [
      cot.folio,
      cot.fecha ? fechaDeCotizacion(cot.fecha).toLocaleDateString('es-PE') : '',
      cot.cliente_nombre,
      cot.cliente_documento || '',
      cot.subtotal?.toFixed(2) || '0.00',
      Number(cot.descuento_global || 0).toFixed(2),
      cot.igv?.toFixed(2) || '0.00',
      cot.total?.toFixed(2) || '0.00',
      this.etiquetaIgv(cot),
      this.getEstadoLabel(cot),
      cot.vendedor_nombre || cot.vendedor || ''
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cotizaciones_${this.empresaActiva?.nombre_comercial || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ─── Acciones por cotización ──────────────────────────────────────────────

  abrirAcciones(event: Event, cot: ICotizacion, menu: Menu) {
    this.accionesMenu = this.accionesDe(cot);
    menu.toggle(event);
    this.cdr.markForCheck();
  }

  /**
   * Solo se revisa lo Pendiente; Aprobada y Anulada se duplican. Pendiente pasa
   * a Aprobada o Anulada, Aprobada vuelve a Pendiente o pasa a Anulada, y Anulada
   * es definitivo. crear_cotizacion() y el trigger de estados aplican lo mismo.
   */
  accionesDe(cot: ICotizacion): MenuItem[] {
    const acciones: MenuItem[] = [];
    if (cot.estado === 'PENDIENTE' && !this.reemplazadaPor(cot)) {
      acciones.push({ label: 'Revisar', icon: 'pi pi-pencil', command: () => this.abrirEnCotizador(cot, 'revision') });
    }
    acciones.push({ label: 'Duplicar', icon: 'pi pi-copy', command: () => this.abrirEnCotizador(cot, 'duplicar') });

    const estados: EstadoDestino[] =
      cot.estado === 'PENDIENTE' ? ['APROBADA', 'ANULADA'] :
      cot.estado === 'APROBADA' ? ['PENDIENTE', 'ANULADA'] : [];
    if (estados.length) {
      acciones.push({ separator: true });
      for (const destino of estados) {
        const config = CONFIRMACION_ESTADO[destino];
        acciones.push({
          label: destino === 'ANULADA' ? 'Anular' : config.titulo,
          icon: config.icono,
          command: () => this.confirmarCambioEstado(cot, destino)
        });
      }
    }

    acciones.push({ separator: true });
    acciones.push({
      label: cot.oculta ? 'Mostrar de nuevo' : 'Ocultar',
      icon: cot.oculta ? 'pi pi-eye' : 'pi pi-eye-slash',
      command: () => this.alternarOculta(cot)
    });
    return acciones;
  }

  confirmarCambioEstado(cot: ICotizacion, destino: EstadoDestino) {
    const config = CONFIRMACION_ESTADO[destino];
    this.confirmSvc.confirm({
      header: config.titulo,
      message: config.mensaje(cot.folio),
      icon: config.icono,
      acceptLabel: config.aceptar,
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: config.claseBoton,
      accept: () => this.cambiarEstado(cot, destino)
    });
  }

  async cambiarEstado(cot: ICotizacion, destino: EstadoDestino) {
    if (!cot.id) return;
    try {
      const actualizada = await this.supabase.actualizarEstado(cot.id, destino);
      this.cotizaciones = this.cotizaciones.map(c => c.id === cot.id ? { ...c, ...actualizada } : c);
      this.aplicarFiltros();
    } catch (e: any) {
      this.msg.add({
        severity: 'error', summary: 'No se cambió el estado',
        detail: e?.code === 'P0001' && e?.message ? e.message : 'No se pudo actualizar el estado'
      });
      await this.cargarDatos();
    }
  }

  /** Folio de la revisión que reemplazó a esta cotización, si la hay. */
  reemplazadaPor(cot: ICotizacion): string | null {
    return (cot.id && this.reemplazos.get(cot.id)) || null;
  }

  async descargarPDF(cotizacion: ICotizacion) {
    if (!cotizacion.id || !this.empresaActiva) return;
    this.descargando = cotizacion.id;
    this.cdr.markForCheck();
    try {
      // Las cotizaciones anteriores a que se guardaran las condiciones se
      // reimprimen sin validez, como hasta ahora.
      const sinCondicionesGuardadas = !cotizacion.condiciones || Object.keys(cotizacion.condiciones).length === 0;
      await this.pdfSvc.generarYDescargarCotizacion(
        cotizacion,
        this.empresaActiva,
        sinCondicionesGuardadas ? { mostrarValidez: false } : {},
        this.reemplazadaPor(cotizacion)
      );
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el PDF' });
    } finally {
      this.descargando = null;
      this.cdr.markForCheck();
    }
  }

  /** Ocultar se puede revertir, así que no pide confirmación. */
  async alternarOculta(cot: ICotizacion) {
    if (!cot.id) return;
    const oculta = !cot.oculta;
    try {
      await this.supabase.actualizarVisibilidadCotizacion(cot.id, oculta);
      this.cotizaciones = this.cotizaciones.map(c => c.id === cot.id ? { ...c, oculta } : c);
      this.aplicarFiltros();
      if (oculta) {
        this.msg.add({ severity: 'info', summary: `${cot.folio} oculta`, detail: `La encuentras en "Ver ocultas (${this.cantidadOcultas})".` });
      }
    } catch (e: any) {
      console.error('Error al ocultar cotización:', e);
      this.msg.add({ severity: 'error', summary: 'No se guardó', detail: 'No se pudo cambiar la visibilidad de la cotización' });
    }
  }

  /** Copia los datos al cotizador. La original no cambia hasta guardar la revisión. */
  abrirEnCotizador(cot: ICotizacion, modo: IBorradorCotizador['modo']) {
    const nombre = this.obtenerNombreCliente(cot);
    const borrador: IBorradorCotizador = {
      modo,
      origen_id:          cot.id || null,
      folio_origen:       cot.folio,
      cliente_nombre:     nombre === 'Sin nombre' ? '' : nombre,
      cliente_documento:  this.obtenerDocumentoCliente(cot),
      cliente_telefono:   cot.cliente_telefono    || '',
      cliente_direccion:  cot.cliente_direccion   || '',
      cliente_correo:     cot.cliente_correo      || '',
      observaciones:      cot.observaciones       || '',
      lugar_entrega:      cot.lugar_entrega       || null,
      modo_igv:           modoIgvDe(cot),
      descuento:          Number(cot.descuento_global) || 0,
      condiciones:        cot.condiciones,
      items:              cot.items               || []
    };
    sessionStorage.setItem(CLAVE_BORRADOR_COTIZADOR, JSON.stringify(borrador));
    this.router.navigate(['/cotizador']);
  }

  // ─── Helpers template ─────────────────────────────────────────────────────

  getEstadoLabel(cot: ICotizacion): string {
    return ETIQUETA_ESTADO[estadoVisible(cot)] ?? cot.estado ?? 'Sin estado';
  }

  getSeverity(cot: ICotizacion): 'success' | 'info' | 'warning' | 'danger' | 'secondary' {
    switch (estadoVisible(cot)) {
      case 'APROBADA':  return 'success';
      case 'PENDIENTE': return 'warning';
      case 'ANULADA':   return 'danger';
      default:          return 'secondary';
    }
  }

  etiquetaIgv(cot: ICotizacion): string {
    return ETIQUETA_IGV[modoIgvDe(cot)];
  }

  /** Bajo la etiqueta de estado: hasta cuándo vale o quién hizo el último cambio. */
  detalleEstado(cot: ICotizacion): string {
    if (cot.estado === 'PENDIENTE') {
      const limite = venceEl(cot);
      if (!limite) return '';
      const fecha = limite.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${estaVencida(cot) ? 'Venció' : 'Vence'} el ${fecha}`;
    }
    if (!cot.estado_cambiado_en) return '';
    const cuando = this.formatearFecha(cot.estado_cambiado_en);
    return cot.estado_cambiado_por_nombre ? `${cot.estado_cambiado_por_nombre} · ${cuando}` : cuando;
  }

  formatearFecha(fecha: string | undefined): string {
    if (!fecha) return '—';
    return fechaDeCotizacion(fecha).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }
}
