import { Component, OnInit, signal, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ICotizacion } from '../../models/cotizacion.model';
import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';

import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { DividerModule } from 'primeng/divider';

interface EstadoOption {
  label: string;
  value: string;
}

interface TopCliente {
  nombre: string;
  cantidad: number;
  total: number;
}

interface OpcionEditar {
  empresaOrigen: 'misma' | 'otra';
  empresaSeleccionadaId: string | null;
  accionOriginal: 'anular' | 'mantener';
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
    SelectModule,
    ToastModule,
    TooltipModule,
    ProgressSpinnerModule,
    ChartModule,
    ConfirmDialogModule,
    DialogModule,
    RadioButtonModule,
    ToggleSwitchModule,
    DividerModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './historial.html',
  styleUrls: ['./historial.scss']
})
export class HistorialComponent implements OnInit {
  cotizaciones: ICotizacion[] = [];
  cotizacionesFiltradas: ICotizacion[] = [];
  empresaActiva: any = null;
  empresasDisponibles: any[] = [];

  descargando = signal<string | null>(null);
  cargando = signal(true);

  mostrarOcultas = false;

  terminoBusqueda = '';
  fechaDesde = '';
  fechaHasta = '';

  totalVendido = 0;
  totalPendiente = 0;
  cotizacionesAprobadas = 0;
  cotizacionesPendientes = 0;
  cotizacionesAnuladas = 0;
  tasaConversion = 0;

  topClientes: TopCliente[] = [];
  chartVentasMensuales: any = {};
  chartOptions: any = {};

  opcionesEstado: EstadoOption[] = [
    { label: 'Pendiente', value: 'PENDIENTE' },
    { label: 'Aprobada',  value: 'APROBADA'  },
    { label: 'Anulada',   value: 'ANULADA'   }
  ];

  modalEditarVisible = signal(false);
  cotizacionParaEditar: ICotizacion | null = null;
  procesandoEdicion = signal(false);
  cargandoEmpresas = signal(false);

  opcionEditar: OpcionEditar = {
    empresaOrigen: 'misma',
    empresaSeleccionadaId: null,
    accionOriginal: 'anular'
  };

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private pdfSvc: PdfService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private confirmSvc: ConfirmationService,
    private router: Router
  ) {
    this.initChartOptions();
  }

  async ngOnInit() {
    await this.cargarDatos();
  }

  async cargarDatos() {
    this.cargando.set(true);
    try {
      const empresaData = sessionStorage.getItem('empresa_activa');
      if (!empresaData) {
        this.msg.add({
          severity: 'warn',
          summary: 'Empresa no seleccionada',
          detail: 'Por favor selecciona una empresa para ver el historial'
        });
        return;
      }

      this.empresaActiva = JSON.parse(empresaData);

      const data = await this.supabase.getHistorial(
        this.empresaActiva.id,
        this.mostrarOcultas
      );

      this.zone.run(() => {
        this.cotizaciones = (data || []).map((c: ICotizacion) => ({
          ...c,
          oculta: c.oculta ?? false
        }));
        this.cotizacionesFiltradas = [...this.cotizaciones];
        this.calcularKPIs();
        this.calcularInsights();
      });
    } catch (error: any) {
      console.error('Error cargando historial:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo cargar el historial de cotizaciones'
      });
    } finally {
      this.cargando.set(false);
      this.cdr.detectChanges();
    }
  }

  async onToggleOcultas() {
    await this.cargarDatos();
  }

  async cargarEmpresasDisponibles() {
    if (this.empresasDisponibles.length > 0) return;

    this.cargandoEmpresas.set(true);
    try {
      const { data: { user } } = await this.supabase.client.auth.getUser();
      if (!user) return;

      const { data, error } = await this.supabase.client
        .from('usuario_empresa')
        .select('empresa_id, empresas(id, nombre_comercial, ruc, ruta_logo)')
        .eq('usuario_id', user.id)
        .eq('activo', true);

      if (error) throw error;

      this.empresasDisponibles = (data || [])
        .map((r: any) => r.empresas)
        .filter(Boolean)
        .filter((empresa: any) => empresa.id !== this.empresaActiva?.id);
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las empresas' });
    } finally {
      this.cargandoEmpresas.set(false);
    }
  }

  // ─── KPIs e Insights ──────────────────────────────────────────────────────

  private calcularKPIs() {
    const base = this.cotizacionesFiltradas;
    const aprobadas  = base.filter(c => c.estado === 'APROBADA');
    const pendientes = base.filter(c => c.estado === 'PENDIENTE');
    const anuladas   = base.filter(c => c.estado === 'ANULADA');

    this.cotizacionesAprobadas  = aprobadas.length;
    this.cotizacionesPendientes = pendientes.length;
    this.cotizacionesAnuladas   = anuladas.length;

    this.totalVendido   = aprobadas.reduce((s, c)  => s + (c.total || 0), 0);
    this.totalPendiente = pendientes.reduce((s, c) => s + (c.total || 0), 0);

    const totalNoAnuladas = base.length - anuladas.length;
    this.tasaConversion = totalNoAnuladas > 0
      ? (this.cotizacionesAprobadas / totalNoAnuladas) * 100
      : 0;
  }

  private calcularInsights() {
    this.calcularTopClientes();
    this.calcularChartVentas();
  }

  private calcularTopClientes() {
    const clienteMap = new Map<string, TopCliente>();
    for (const cot of this.cotizacionesFiltradas) {
      const key = cot.cliente_nombre || 'Sin nombre';
      const existing = clienteMap.get(key) || { nombre: key, cantidad: 0, total: 0 };
      existing.cantidad++;
      existing.total += cot.total || 0;
      clienteMap.set(key, existing);
    }
    this.topClientes = Array.from(clienteMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  private calcularChartVentas() {
    const meses: { [key: string]: number } = {};
    const hoy = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses[key] = 0;
    }
    for (const cot of this.cotizacionesFiltradas.filter(c => c.estado === 'APROBADA')) {
      if (!cot.fecha) continue;
      const fecha = new Date(cot.fecha);
      const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (meses[key] !== undefined) meses[key] += cot.total || 0;
    }
    const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const labels = Object.keys(meses).map(k => {
      const [y, m] = k.split('-');
      return `${nombres[parseInt(m, 10) - 1]} ${y.slice(2)}`;
    });
    this.chartVentasMensuales = {
      labels,
      datasets: [{
        label: 'Ventas Aprobadas (S/)',
        data: Object.values(meses),
        backgroundColor: 'rgba(1, 105, 111, 0.7)',
        borderColor: '#01696f',
        borderWidth: 1,
        borderRadius: 6
      }]
    };
  }

  private initChartOptions() {
    this.chartOptions = {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: '#f1f5f9' } },
        x: { ticks: { font: { size: 10 } }, grid: { display: false } }
      },
      maintainAspectRatio: false
    };
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────

  filtrarCotizaciones(_termino: string) { this.aplicarFiltros(); }
  aplicarFiltroFecha()                   { this.aplicarFiltros(); }

  limpiarFiltros() {
    this.terminoBusqueda = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.cotizacionesFiltradas = [...this.cotizaciones];
    this.calcularKPIs();
    this.calcularInsights();
  }

  private aplicarFiltros() {
    let resultado = [...this.cotizaciones];

    if (this.terminoBusqueda.trim()) {
      const term = this.terminoBusqueda.toLowerCase().trim();
      resultado = resultado.filter(cot =>
        (cot.folio              || '').toLowerCase().includes(term) ||
        (cot.cliente_nombre     || '').toLowerCase().includes(term) ||
        (cot.cliente_documento  || '').toLowerCase().includes(term) ||
        (cot.estado             || '').toLowerCase().includes(term)
      );
    }

    if (this.fechaDesde) {
      const desde = new Date(this.fechaDesde);
      resultado = resultado.filter(cot => cot.fecha && new Date(cot.fecha) >= desde);
    }

    if (this.fechaHasta) {
      const hasta = new Date(this.fechaHasta + 'T23:59:59');
      resultado = resultado.filter(cot => cot.fecha && new Date(cot.fecha) <= hasta);
    }

    this.cotizacionesFiltradas = resultado;
    this.calcularKPIs();
    this.calcularInsights();
  }

  // ─── Acciones ─────────────────────────────────────────────────────────────

  exportarCSV() {
    if (!this.cotizacionesFiltradas.length) {
      this.msg.add({ severity: 'warn', summary: 'Sin datos', detail: 'No hay cotizaciones para exportar' });
      return;
    }
    const headers = ['Folio','Fecha','Cliente','Documento','Total','Estado','Vendedor'];
    const rows = this.cotizacionesFiltradas.map(cot => [
      cot.folio,
      cot.fecha ? new Date(cot.fecha).toLocaleDateString('es-PE') : '',
      cot.cliente_nombre,
      cot.cliente_documento || '',
      cot.total?.toFixed(2) || '0.00',
      this.getEstadoLabel(cot.estado),
      cot.vendedor || ''
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cotizaciones_${this.empresaActiva?.nombre_comercial || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.msg.add({ severity: 'success', summary: 'Exportado', detail: `${rows.length} registros exportados` });
  }

  async cambiarEstado(cotizacion: ICotizacion, nuevoEstado: string) {
    if (!cotizacion.id || !nuevoEstado) return;
    try {
      await this.supabase.actualizarEstado(cotizacion.id, nuevoEstado);

      [this.cotizaciones, this.cotizacionesFiltradas].forEach(arr => {
        const idx = arr.findIndex(c => c.id === cotizacion.id);
        if (idx !== -1) arr[idx] = { ...arr[idx], estado: nuevoEstado };
      });

      this.calcularKPIs();
      this.calcularInsights();
      this.msg.add({ severity: 'success', summary: 'Estado actualizado',
        detail: `${cotizacion.folio} → ${this.getEstadoLabel(nuevoEstado)}` });
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el estado' });
      await this.cargarDatos();
    }
  }

  async descargarPDF(cotizacion: ICotizacion) {
    if (!cotizacion.id || !this.empresaActiva) return;
    this.descargando.set(cotizacion.id);
    try {
      await this.pdfSvc.generarYDescargarCotizacion(
        cotizacion,
        this.empresaActiva,
        cotizacion.lugar_entrega || '',
        {
          mostrarValidez: false,
          mostrarCuentas: this.empresaActiva.mostrar_cuentas ?? true
        }
      );
      this.msg.add({ severity: 'success', summary: 'PDF generado', detail: `${cotizacion.folio} descargada` });
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el PDF' });
    } finally {
      this.descargando.set(null);
    }
  }

  async ocultarCotizacion(cot: ICotizacion) {
    const yaOculta = cot.oculta === true;
    const accion = yaOculta ? 'mostrar' : 'ocultar';

    this.confirmSvc.confirm({
      message: `¿Deseas ${accion} la cotización <strong>${cot.folio}</strong>?<br>
                <small>${yaOculta
                  ? 'Volverá a aparecer en el historial normal.'
                  : 'Solo los administradores podrán verla con el toggle activado.'}</small>`,
      header: yaOculta ? 'Mostrar cotización' : 'Ocultar cotización',
      icon: yaOculta ? 'pi pi-eye' : 'pi pi-eye-slash',
      acceptLabel: yaOculta ? 'Sí, mostrar' : 'Sí, ocultar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-secondary',
      accept: async () => {
        try {
          const { error } = await this.supabase.client
            .from('cotizaciones').update({ oculta: !yaOculta }).eq('id', cot.id!);
          if (error) throw error;
          this.msg.add({
            severity: 'info',
            summary: yaOculta ? 'Cotización visible' : 'Cotización oculta',
            detail: cot.folio
          });
          await this.cargarDatos();
        } catch (e: any) {
          this.msg.add({ severity: 'error', summary: 'Error', detail: e.message });
        }
      }
    });
  }

  async abrirModalEditar(cot: ICotizacion) {
    this.cotizacionParaEditar = cot;
    this.opcionEditar = {
      empresaOrigen: 'misma',
      empresaSeleccionadaId: this.empresaActiva?.id || null,
      accionOriginal: 'anular'
    };
    await this.cargarEmpresasDisponibles();
    this.modalEditarVisible.set(true);
  }

  onEmpresaOrigenChange() {
    if (this.opcionEditar.empresaOrigen === 'misma') {
      this.opcionEditar.empresaSeleccionadaId = this.empresaActiva?.id || null;
    } else {
      this.opcionEditar.empresaSeleccionadaId = null;
    }
  }

  async confirmarEdicion() {
    if (!this.cotizacionParaEditar) return;

    if (this.opcionEditar.empresaOrigen === 'otra' && !this.opcionEditar.empresaSeleccionadaId) {
      this.msg.add({ severity: 'warn', summary: 'Selecciona una empresa',
        detail: 'Debes elegir la empresa con la que continuarás' });
      return;
    }

    this.procesandoEdicion.set(true);
    const cot = this.cotizacionParaEditar;

    try {
      if (this.opcionEditar.accionOriginal === 'anular') {
        const { error } = await this.supabase.client
          .from('cotizaciones').update({ estado: 'ANULADA' }).eq('id', cot.id!);
        if (error) throw error;
      }

      let empresaDestino = this.empresaActiva;
      if (this.opcionEditar.empresaOrigen === 'otra') {
        empresaDestino = this.empresasDisponibles.find(
          e => e.id === this.opcionEditar.empresaSeleccionadaId
        );
        if (!empresaDestino) throw new Error('No se encontró la empresa seleccionada');
        sessionStorage.setItem('empresa_activa', JSON.stringify(empresaDestino));
        sessionStorage.setItem('empresa_activa_id', empresaDestino.id);
      }

      const borrador = {
        modo: 'editar',
        folio_padre: cot.folio,
        cotizacion_id: cot.id,
        cliente_nombre:     cot.cliente_nombre     || '',
        cliente_documento:  cot.cliente_documento   || '',
        cliente_telefono:   cot.cliente_telefono    || '',
        cliente_direccion:  cot.cliente_direccion   || '',
        cliente_correo:     cot.cliente_correo      || '',
        observaciones:      cot.observaciones       || '',
        lugar_entrega:      cot.lugar_entrega       || 'CANTERA',
        items:              cot.items               || []
      };

      sessionStorage.setItem('cotizador-borrador', JSON.stringify(borrador));
      this.msg.add({ severity: 'success', summary: 'Listo', detail: 'Redirigiendo al cotizador...', life: 1500 });
      this.modalEditarVisible.set(false);
      setTimeout(() => this.router.navigate(['/cotizador']), 900);

    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo procesar' });
    } finally {
      this.procesandoEdicion.set(false);
    }
  }

  // ─── Helpers template ─────────────────────────────────────────────────────

  getEstadoLabel(estado: string): string {
    return this.opcionesEstado.find(o => o.value === estado)?.label || estado || 'Sin estado';
  }

  getSeverity(estado: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (estado) {
      case 'APROBADA':  return 'success';
      case 'PENDIENTE': return 'warn';
      case 'ANULADA':   return 'danger';
      default:          return 'secondary';
    }
  }

  formatearFecha(fecha: string | undefined): string {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }
}