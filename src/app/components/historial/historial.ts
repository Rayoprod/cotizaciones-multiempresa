import { Component, OnInit, signal, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ICotizacion } from '../../models/cotizacion.model';
import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ChartModule } from 'primeng/chart';
import { MessageService } from 'primeng/api';

interface EstadoOption {
  label: string;
  value: string;
}

interface TopCliente {
  nombre: string;
  cantidad: number;
  total: number;
}

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, ButtonModule, InputTextModule,
    TagModule, SelectModule, ToastModule, TooltipModule,
    ProgressSpinnerModule, ChartModule
  ],
  providers: [MessageService],
  templateUrl: './historial.html',
  styleUrls: ['./historial.scss']
})
export class HistorialComponent implements OnInit {

  cotizaciones: ICotizacion[] = [];
  cotizacionesFiltradas: ICotizacion[] = [];
  empresaActiva: any = null;
  descargando = signal<string | null>(null);
  cargando = signal(true);

  // Filtros
  terminoBusqueda = '';
  fechaDesde = '';
  fechaHasta = '';

  // KPIs
  totalVendido = 0;
  totalPendiente = 0;
  cotizacionesAprobadas = 0;
  cotizacionesPendientes = 0;
  cotizacionesAnuladas = 0;
  tasaConversion = 0;

  // Insights
  topClientes: TopCliente[] = [];
  chartVentasMensuales: any = {};
  chartOptions: any = {};

  opcionesEstado: EstadoOption[] = [
    { label: 'Pendiente', value: 'PENDIENTE' },
    { label: 'Aprobada',  value: 'APROBADA' },
    { label: 'Anulada',   value: 'ANULADA' }
  ];

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private pdfSvc: PdfService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
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
      if (empresaData) {
        this.empresaActiva = JSON.parse(empresaData);
        const data = await this.supabase.getHistorial(this.empresaActiva.id);
        this.zone.run(() => {
          this.cotizaciones = data;
          this.cotizacionesFiltradas = [...data];
          this.calcularKPIs();
          this.calcularInsights();
        });
      } else {
        this.msg.add({
          severity: 'warn',
          summary: 'Empresa no seleccionada',
          detail: 'Por favor selecciona una empresa para ver el historial'
        });
      }
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

  // ── KPIs ───────────────────────────────────────────────────

  private calcularKPIs() {
    const aprobadas = this.cotizaciones.filter(c => c.estado === 'APROBADA');
    const pendientes = this.cotizaciones.filter(c => c.estado === 'PENDIENTE');
    const anuladas = this.cotizaciones.filter(c => c.estado === 'ANULADA');

    this.cotizacionesAprobadas = aprobadas.length;
    this.cotizacionesPendientes = pendientes.length;
    this.cotizacionesAnuladas = anuladas.length;

    this.totalVendido = aprobadas.reduce((sum, c) => sum + (c.total || 0), 0);
    this.totalPendiente = pendientes.reduce((sum, c) => sum + (c.total || 0), 0);

    const totalNoAnuladas = this.cotizaciones.length - anuladas.length;
    this.tasaConversion = totalNoAnuladas > 0
      ? (this.cotizacionesAprobadas / totalNoAnuladas) * 100
      : 0;
  }

  // ── INSIGHTS ───────────────────────────────────────────────

  private calcularInsights() {
    this.calcularTopClientes();
    this.calcularChartVentas();
  }

  private calcularTopClientes() {
    const clienteMap = new Map<string, { nombre: string; cantidad: number; total: number }>();

    for (const cot of this.cotizaciones) {
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

    for (const cot of this.cotizaciones.filter(c => c.estado === 'APROBADA')) {
      if (!cot.fecha) continue;
      const fecha = new Date(cot.fecha);
      const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (meses[key] !== undefined) {
        meses[key] += cot.total || 0;
      }
    }

    const labels = Object.keys(meses).map(k => {
      const [y, m] = k.split('-');
      const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return nombres[parseInt(m) - 1] + ' ' + y.slice(2);
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
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } },
          grid: { color: '#f1f5f9' }
        },
        x: {
          ticks: { font: { size: 10 } },
          grid: { display: false }
        }
      },
      maintainAspectRatio: false
    };
  }

  // ── FILTROS ─────────────────────────────────────────────────

  filtrarCotizaciones(termino: string) {
    this.aplicarFiltros();
  }

  aplicarFiltroFecha() {
    this.aplicarFiltros();
  }

  limpiarFiltros() {
    this.terminoBusqueda = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.cotizacionesFiltradas = [...this.cotizaciones];
  }

  private aplicarFiltros() {
    let resultado = [...this.cotizaciones];

    // Filtro por texto
    if (this.terminoBusqueda.trim()) {
      const term = this.terminoBusqueda.toLowerCase().trim();
      resultado = resultado.filter(cot =>
        cot.folio.toLowerCase().includes(term) ||
        cot.cliente_nombre.toLowerCase().includes(term) ||
        (cot.cliente_documento && cot.cliente_documento.toLowerCase().includes(term)) ||
        (cot.estado && cot.estado.toLowerCase().includes(term))
      );
    }

    // Filtro por fecha desde
    if (this.fechaDesde) {
      const desde = new Date(this.fechaDesde);
      resultado = resultado.filter(cot => cot.fecha && new Date(cot.fecha) >= desde);
    }

    // Filtro por fecha hasta
    if (this.fechaHasta) {
      const hasta = new Date(this.fechaHasta + 'T23:59:59');
      resultado = resultado.filter(cot => cot.fecha && new Date(cot.fecha) <= hasta);
    }

    this.cotizacionesFiltradas = resultado;
  }

  // ── EXPORTAR CSV ────────────────────────────────────────────

  exportarCSV() {
    if (this.cotizacionesFiltradas.length === 0) {
      this.msg.add({ severity: 'warn', summary: 'Sin datos', detail: 'No hay cotizaciones para exportar' });
      return;
    }

    const headers = ['Folio', 'Fecha', 'Cliente', 'Documento', 'Total', 'Estado', 'Vendedor'];
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
      .map(row => row.map(cell => `"${cell}"`).join(','))
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

  // ── CAMBIAR ESTADO ───────────────────────────────────────

  async cambiarEstado(cotizacion: ICotizacion, nuevoEstado: string) {
    try {
      if (!cotizacion.id || !nuevoEstado) return;

      await this.supabase.actualizarEstado(cotizacion.id, nuevoEstado);

      const idx = this.cotizaciones.findIndex(c => c.id === cotizacion.id);
      if (idx !== -1) {
        this.cotizaciones[idx] = { ...this.cotizaciones[idx], estado: nuevoEstado };
        this.cotizacionesFiltradas = [...this.cotizaciones];
        this.calcularKPIs();
        this.calcularInsights();
      }

      this.msg.add({
        severity: 'success',
        summary: 'Estado actualizado',
        detail: `Cotización ${cotizacion.folio} → ${this.getEstadoLabel(nuevoEstado)}`
      });
    } catch (error: any) {
      console.error('Error cambiando estado:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo actualizar el estado'
      });
      await this.cargarDatos();
    }
  }

  // ── DESCARGAR PDF ─────────────────────────────────────────

  async descargarPDF(cotizacion: ICotizacion) {
    if (!cotizacion.id || !this.empresaActiva) return;

    this.descargando.set(cotizacion.id);
    try {
      await this.pdfSvc.generarYDescargarCotizacion(
        cotizacion,
        this.empresaActiva,
        cotizacion.lugar_entrega || '',
        { mostrarValidez: false, mostrarCuentas: this.empresaActiva.mostrar_cuentas ?? true }
      );

      this.msg.add({
        severity: 'success',
        summary: 'PDF generado',
        detail: `Cotización ${cotizacion.folio} descargada`
      });
    } catch (error: any) {
      console.error('Error descargando PDF:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo generar el PDF'
      });
    } finally {
      this.descargando.set(null);
    }
  }

  // ── UTILIDADES ───────────────────────────────────────────

  getNombreEmpresa(empresaId: string): string {
    return this.empresaActiva?.nombre_comercial || 'Desconocida';
  }

  getEstadoLabel(estado: string): string {
    const opcion = this.opcionesEstado.find(o => o.value === estado);
    return opcion?.label || estado || 'Sin estado';
  }

  getSeverity(estado: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (estado) {
      case 'APROBADA':  return 'success';
      case 'PENDIENTE': return 'warn';
      case 'ANULADA':   return 'danger';
      default:          return 'secondary';
    }
  }

  trackByCotizacion(index: number, cotizacion: ICotizacion): string {
    return cotizacion.id || '';
  }
}
