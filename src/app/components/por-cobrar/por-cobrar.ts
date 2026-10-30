import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import {
  ETIQUETA_ENTREGA, IDeudaCliente, IVenta, cobradoEnElMes, deudasPorCliente, diasDeAtraso, estaVencidaVenta, fechaCorta,
  redondear2, severidadEntrega, textoComprobante
} from '../../models';
import { descargarCsv } from '../../services/csv';
import { SessionContextService } from '../../services/session-context.service';
import { SupabaseService } from '../../services/supabase.service';
import { AccionesVentaComponent } from '../ventas/acciones-venta';

@Component({
  selector: 'app-por-cobrar',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TagModule, AccionesVentaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './por-cobrar.html',
  styleUrls: ['../listas.scss', './por-cobrar.scss']
})
export class PorCobrarComponent implements OnInit {
  @ViewChild(AccionesVentaComponent, { static: true }) acciones!: AccionesVentaComponent;

  readonly fechaCorta = fechaCorta;

  ventas: IVenta[] = [];
  deudas: IDeudaCliente[] = [];
  deudasFiltradas: IDeudaCliente[] = [];
  empresaActiva: any = null;
  cargando = true;

  terminoBusqueda = '';
  soloVencidas = false;
  /** Documentos de los clientes con sus ventas a la vista. */
  abiertas = new Set<string>();

  totalPorCobrar = 0;
  totalVencido = 0;
  clientesVencidos = 0;
  /** Lo más delicado: el material ya salió y falta el dinero. */
  entregadoSinPagar = 0;
  ventasEntregadasSinPagar = 0;
  cobradoEsteMes = 0;

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private cdr: ChangeDetectorRef,
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
      this.ventas = await this.supabase.getVentas(this.empresaActiva.id);
      this.calcular();
    } catch (error) {
      console.error('Error cargando por cobrar:', error);
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar lo que hay por cobrar' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  alActualizar(venta: IVenta) {
    this.ventas = this.ventas.map(v => v.id === venta.id ? venta : v);
    this.calcular();
  }

  private calcular() {
    const hoy = new Date();
    this.deudas = deudasPorCliente(this.ventas, hoy);
    this.totalPorCobrar = redondear2(this.deudas.reduce((suma, d) => suma + d.saldo, 0));
    this.totalVencido = redondear2(this.deudas.reduce((suma, d) => suma + d.vencido, 0));
    this.clientesVencidos = this.deudas.filter(d => d.vencido > 0).length;
    const entregadas = this.deudas.flatMap(d => d.ventas).filter(v => v.estado_entrega === 'ENTREGADA');
    this.entregadoSinPagar = redondear2(entregadas.reduce((suma, v) => suma + Number(v.saldo), 0));
    this.ventasEntregadasSinPagar = entregadas.length;
    this.cobradoEsteMes = cobradoEnElMes(this.ventas, hoy);
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    const termino = this.terminoBusqueda.toLowerCase().trim();
    this.deudasFiltradas = this.deudas.filter(d =>
      (!this.soloVencidas || d.vencido > 0) &&
      (!termino || d.nombre.toLowerCase().includes(termino) || d.documento.includes(termino))
    );
    this.cdr.markForCheck();
  }

  alternarVencidas() {
    this.soloVencidas = !this.soloVencidas;
    this.aplicarFiltros();
  }

  alternar(documento: string) {
    if (this.abiertas.has(documento)) this.abiertas.delete(documento);
    else this.abiertas.add(documento);
    this.cdr.markForCheck();
  }

  porDocumento(_: number, deuda: IDeudaCliente): string {
    return deuda.documento;
  }

  estaVencida(venta: IVenta): boolean {
    return estaVencidaVenta(venta);
  }

  /** Cuándo toca cobrar esta venta. */
  textoVencimiento(venta: IVenta): string {
    const atraso = diasDeAtraso(venta);
    if (atraso > 0) return `Venció hace ${atraso} día${atraso === 1 ? '' : 's'}`;
    if (venta.vence_el) return `Vence el ${fechaCorta(venta.vence_el)}`;
    return venta.condicion_pago === 'CREDITO' ? 'Crédito sin fecha' : 'Contado';
  }

  etiquetaEntrega(venta: IVenta): string {
    return ETIQUETA_ENTREGA[venta.estado_entrega];
  }

  severidadDeEntrega(venta: IVenta) {
    return severidadEntrega(venta.estado_entrega);
  }

  exportarCSV() {
    if (!this.deudasFiltradas.length) {
      this.msg.add({ severity: 'warn', summary: 'Sin datos', detail: 'No hay deudas para exportar' });
      return;
    }
    const filas = this.deudasFiltradas.flatMap(d => d.ventas.map(v => [
      d.nombre,
      d.documento,
      v.folio,
      fechaCorta(v.fecha),
      Number(v.total).toFixed(2),
      Number(v.pagado).toFixed(2),
      Number(v.saldo).toFixed(2),
      v.vence_el ? fechaCorta(v.vence_el) : '',
      diasDeAtraso(v) || '',
      this.etiquetaEntrega(v),
      textoComprobante(v) ?? ''
    ]));
    descargarCsv(
      `por_cobrar_${this.empresaActiva?.nombre_comercial || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Cliente', 'Documento', 'Folio', 'Fecha', 'Total', 'Pagado', 'Saldo', 'Vence', 'Días de atraso', 'Entrega', 'Comprobante'],
      filas
    );
  }
}
