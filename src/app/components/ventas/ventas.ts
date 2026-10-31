import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MenuItem, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Menu, MenuModule } from 'primeng/menu';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
  ETIQUETA_COBRO, ETIQUETA_ENTREGA, IVenta, diasDeAtraso, estadoCobro, estaVencidaVenta, facturadoDe, faltaFacturar, fechaCorta,
  redondear2, resumenComprobantes, severidadCobro, severidadEntrega, soles, textoComprobantes, textoFaltanteVenta, tieneEntregaCalculada
} from '../../models';
import { descargarCsv } from '../../services/csv';
import { SessionContextService } from '../../services/session-context.service';
import { SupabaseService } from '../../services/supabase.service';
import { AccionesVentaComponent } from './acciones-venta';

export type FiltroVenta = 'TODAS' | 'POR_COBRAR' | 'VENCIDAS' | 'POR_ENTREGAR' | 'POR_FACTURAR' | 'ANULADAS';

export function cumpleFiltroVenta(venta: IVenta, filtro: FiltroVenta, hoy: Date = new Date()): boolean {
  switch (filtro) {
    case 'POR_COBRAR': return venta.estado === 'ACTIVA' && Number(venta.saldo) > 0;
    case 'VENCIDAS': return estaVencidaVenta(venta, hoy);
    case 'POR_ENTREGAR': return venta.estado === 'ACTIVA' && venta.estado_entrega !== 'ENTREGADA';
    case 'POR_FACTURAR': return (faltaFacturar(venta) ?? 0) > 0;
    case 'ANULADAS': return venta.estado === 'ANULADA';
    default: return true;
  }
}

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, ButtonModule, InputTextModule, MenuModule, TableModule, TagModule, TooltipModule,
    AccionesVentaComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas.html',
  styleUrls: ['../listas.scss']
})
export class VentasComponent implements OnInit {
  @ViewChild(AccionesVentaComponent, { static: true }) acciones!: AccionesVentaComponent;

  readonly fechaCorta = fechaCorta;
  readonly resumenComprobantes = resumenComprobantes;

  ventas: IVenta[] = [];
  ventasFiltradas: IVenta[] = [];
  empresaActiva: any = null;
  cargando = true;

  terminoBusqueda = '';
  fechaDesde = '';
  fechaHasta = '';
  filtro: FiltroVenta = 'TODAS';

  readonly filtros: Array<{ value: FiltroVenta; label: string }> = [
    { value: 'TODAS', label: 'Todas' },
    { value: 'POR_COBRAR', label: 'Por cobrar' },
    { value: 'VENCIDAS', label: 'Vencidas' },
    { value: 'POR_ENTREGAR', label: 'Por entregar' },
    { value: 'POR_FACTURAR', label: 'Por facturar' },
    { value: 'ANULADAS', label: 'Anuladas' }
  ];
  conteos: Record<FiltroVenta, number> = { TODAS: 0, POR_COBRAR: 0, VENCIDAS: 0, POR_ENTREGAR: 0, POR_FACTURAR: 0, ANULADAS: 0 };

  totalVendido = 0;
  totalCobrado = 0;
  totalPorCobrar = 0;

  /** Acciones de la venta cuyo menú está abierto. */
  accionesMenu: MenuItem[] = [];

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private session: SessionContextService
  ) {}

  async ngOnInit() {
    await this.cargarDatos();
    this.abrirVentaPedida();
  }

  async cargarDatos() {
    this.cargando = true;
    try {
      this.empresaActiva = this.session.empresaActiva();
      if (!this.empresaActiva) {
        this.router.navigate(['/selector']);
        return;
      }
      this.ventas = await this.supabase.getVentas(this.empresaActiva.id);
      this.aplicarFiltros();
    } catch (error) {
      console.error('Error cargando ventas:', error);
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las ventas' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  /** ?venta=id: al registrar una venta o al llegar desde su cotización, se abre su detalle. */
  private abrirVentaPedida() {
    const id = this.route.snapshot.queryParamMap.get('venta');
    if (!id) return;
    const venta = this.ventas.find(v => v.id === id);
    if (venta) this.acciones.verDetalle(venta);
    // Sin el parámetro, recargar la página no vuelve a abrirlo.
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  alActualizar(venta: IVenta) {
    this.ventas = this.ventas.map(v => v.id === venta.id ? venta : v);
    this.aplicarFiltros();
  }

  // ─── Filtros y KPIs ───────────────────────────────────────────────────────

  elegirFiltro(filtro: FiltroVenta) {
    this.filtro = filtro;
    this.aplicarFiltros();
  }

  get hayFiltros(): boolean {
    return !!this.terminoBusqueda.trim() || !!this.fechaDesde || !!this.fechaHasta || this.filtro !== 'TODAS';
  }

  limpiarFiltros() {
    this.terminoBusqueda = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.filtro = 'TODAS';
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    let base = this.ventas;
    const termino = this.terminoBusqueda.toLowerCase().trim();
    if (termino) {
      base = base.filter(v =>
        v.folio.toLowerCase().includes(termino) ||
        v.cliente_nombre.toLowerCase().includes(termino) ||
        v.cliente_documento.includes(termino) ||
        (v.venta_comprobantes ?? []).some(c => c.numero.toLowerCase().includes(termino)) ||
        (v.folio_cotizacion ?? '').toLowerCase().includes(termino)
      );
    }
    if (this.fechaDesde) base = base.filter(v => v.fecha >= this.fechaDesde);
    if (this.fechaHasta) base = base.filter(v => v.fecha <= this.fechaHasta);

    // Conteos y KPIs no dependen del filtro de estado: elegir "Vencidas" no debe
    // cambiar lo vendido.
    this.calcularKPIs(base);
    this.ventasFiltradas = base.filter(v => cumpleFiltroVenta(v, this.filtro));
    this.cdr.markForCheck();
  }

  private calcularKPIs(base: IVenta[]) {
    const hoy = new Date();
    const conteos = {} as Record<FiltroVenta, number>;
    for (const f of this.filtros) conteos[f.value] = base.filter(v => cumpleFiltroVenta(v, f.value, hoy)).length;
    this.conteos = conteos;

    const activas = base.filter(v => v.estado === 'ACTIVA');
    this.totalVendido = redondear2(activas.reduce((suma, v) => suma + Number(v.total), 0));
    this.totalCobrado = redondear2(activas.reduce((suma, v) => suma + Number(v.pagado), 0));
    this.totalPorCobrar = redondear2(activas.reduce((suma, v) => suma + Number(v.saldo), 0));
  }

  // ─── Acciones ─────────────────────────────────────────────────────────────

  abrirAcciones(event: Event, venta: IVenta, menu: Menu) {
    this.accionesMenu = this.acciones.menuDe(venta);
    menu.toggle(event);
    this.cdr.markForCheck();
  }

  exportarCSV() {
    if (!this.ventasFiltradas.length) {
      this.msg.add({ severity: 'warn', summary: 'Sin datos', detail: 'No hay ventas para exportar' });
      return;
    }
    descargarCsv(
      `ventas_${this.empresaActiva?.nombre_comercial || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Folio', 'Fecha', 'Cliente', 'Documento', 'Total', 'Pagado', 'Saldo', 'Vence', 'Cobro', 'Entrega', 'Facturado', 'Comprobantes', 'Cotización', 'Vendedor'],
      this.ventasFiltradas.map(v => [
        v.folio,
        fechaCorta(v.fecha),
        v.cliente_nombre,
        v.cliente_documento,
        Number(v.total).toFixed(2),
        Number(v.pagado).toFixed(2),
        Number(v.saldo).toFixed(2),
        v.vence_el ? fechaCorta(v.vence_el) : '',
        this.etiquetaCobro(v),
        this.etiquetaEntrega(v),
        facturadoDe(v).toFixed(2),
        textoComprobantes(v) ?? '',
        v.folio_cotizacion ?? '',
        v.vendedor_nombre || v.vendedor || ''
      ])
    );
  }

  // ─── Helpers de la plantilla ──────────────────────────────────────────────

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

  /** Bajo la etiqueta de entrega: cuánto falta, si lo calculan las salidas. */
  detalleEntrega(venta: IVenta): string | null {
    if (venta.estado !== 'ACTIVA' || !tieneEntregaCalculada(venta)) return null;
    return textoFaltanteVenta(venta);
  }

  /** Bajo la etiqueta de cobro: cuánto debe y hasta cuándo. */
  detalleCobro(venta: IVenta): string {
    if (venta.estado !== 'ACTIVA' || Number(venta.saldo) <= 0) return '';
    const debe = `Debe ${soles(venta.saldo)}`;
    const atraso = diasDeAtraso(venta);
    if (atraso > 0) return `${debe}, venció hace ${atraso} día${atraso === 1 ? '' : 's'}`;
    return venta.vence_el ? `${debe}, vence el ${fechaCorta(venta.vence_el)}` : debe;
  }
}
