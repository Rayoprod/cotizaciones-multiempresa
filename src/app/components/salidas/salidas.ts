import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
  ISalida, IVehiculo, IVenta, IVentaItem, PROPIETARIOS, PropietarioVehiculo, cantidadConUnidad, esSalidaSinEnlazar, esUnidadDeServicio,
  fechaCorta, fechaIso, formatoPlaca, motivosDeRevision, normalizarPlaca, resumenDelDia, textoFaltanteVenta
} from '../../models';
import { descargarCsv } from '../../services/csv';
import { mensajeDe } from '../../services/errores';
import { SessionContextService } from '../../services/session-context.service';
import { SupabaseService } from '../../services/supabase.service';

export type FiltroSalida = 'TODAS' | 'POR_REVISAR' | 'SIN_VENTA' | 'ANULADAS';

/** Las que están por revisar se ven siempre, aunque sean de antes de las fechas elegidas. */
export function cumpleFiltroSalida(salida: ISalida, filtro: FiltroSalida): boolean {
  switch (filtro) {
    case 'POR_REVISAR': return salida.por_revisar;
    case 'SIN_VENTA': return esSalidaSinEnlazar(salida) && !salida.revisada_en;
    case 'ANULADAS': return salida.estado === 'ANULADA';
    default: return true;
  }
}

/** Lo que falta en un volquete que el encargado agregó desde la cantera. */
export function faltaCompletar(vehiculo: Pick<IVehiculo, 'activo' | 'propietario' | 'capacidad_m3'>): boolean {
  return vehiculo.activo && (!vehiculo.propietario || !vehiculo.capacidad_m3);
}

interface IFormularioVolquete {
  id: string | null;
  placa: string;
  capacidad_m3: number | null;
  propietario: PropietarioVehiculo | null;
  chofer: string;
  activo: boolean;
}

/** Lo que el encargado anotó en la cantera, y lo que la oficina hace con eso. */
@Component({
  selector: 'app-salidas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ButtonModule, DialogModule, InputTextModule, InputTextareaModule, TableModule, TagModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './salidas.html',
  styleUrls: ['../listas.scss', './salidas.scss']
})
export class SalidasComponent implements OnInit {
  readonly fechaCorta = fechaCorta;
  readonly formatoPlaca = formatoPlaca;
  readonly cantidadConUnidad = cantidadConUnidad;
  readonly motivosDeRevision = motivosDeRevision;
  readonly faltaCompletar = faltaCompletar;
  readonly propietarios = PROPIETARIOS;

  vista: 'SALIDAS' | 'VOLQUETES' = 'SALIDAS';
  empresaActiva: any = null;
  cargando = true;

  salidas: ISalida[] = [];
  salidasFiltradas: ISalida[] = [];
  vehiculos: IVehiculo[] = [];

  terminoBusqueda = '';
  fechaDesde = fechaIso(new Date(Date.now() - 30 * 86400000));
  fechaHasta = fechaIso();
  filtro: FiltroSalida = 'TODAS';
  readonly filtros: Array<{ value: FiltroSalida; label: string }> = [
    { value: 'TODAS', label: 'Todas' },
    { value: 'POR_REVISAR', label: 'Por revisar' },
    { value: 'SIN_VENTA', label: 'Sin venta' },
    { value: 'ANULADAS', label: 'Anuladas' }
  ];
  conteos: Record<FiltroSalida, number> = { TODAS: 0, POR_REVISAR: 0, SIN_VENTA: 0, ANULADAS: 0 };

  resumenHoy = '';
  resumenPeriodo = '';

  // Cada ventana conserva sus datos al cerrarse: si no, se vería vacía mientras se va.
  enlazarAbierto = false;
  salidaAEnlazar: ISalida | null = null;
  ventasParaEnlazar: IVenta[] = [];
  cargandoVentas = false;
  busquedaVenta = '';

  motivoAbierto = false;
  pedido: { titulo: string; mensaje: string; etiqueta: string; boton: string; peligro: boolean; ejecutar: (texto: string) => Promise<ISalida>; exito: string } | null = null;
  textoMotivo = '';

  volqueteAbierto = false;
  volquete: IFormularioVolquete = this.volqueteVacio();
  mostrarFaltantesVolquete = false;

  guardando = false;

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

  get esAdmin(): boolean {
    return this.session.esAdminEmpresaActiva();
  }

  async cargarDatos() {
    this.cargando = true;
    this.cdr.markForCheck();
    try {
      this.empresaActiva = this.session.empresaActiva();
      if (!this.empresaActiva) {
        this.router.navigate(['/selector']);
        return;
      }
      const [salidas, vehiculos] = await Promise.all([
        this.supabase.getSalidas(this.empresaActiva.id, this.fechaDesde || '2000-01-01', this.fechaHasta || fechaIso()),
        this.supabase.getVehiculos(this.empresaActiva.id)
      ]);
      this.salidas = salidas;
      this.vehiculos = vehiculos;
      this.aplicarFiltros();
    } catch (error) {
      console.error('Error cargando salidas:', error);
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las salidas' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  elegirVista(vista: SalidasComponent['vista']) {
    this.vista = vista;
    this.cdr.markForCheck();
  }

  // ─── Filtros y KPIs ───────────────────────────────────────────────────────

  elegirFiltro(filtro: FiltroSalida) {
    this.filtro = filtro;
    this.aplicarFiltros();
  }

  get hayFiltros(): boolean {
    return !!this.terminoBusqueda.trim() || this.filtro !== 'TODAS';
  }

  limpiarFiltros() {
    this.terminoBusqueda = '';
    this.filtro = 'TODAS';
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    const termino = this.terminoBusqueda.toLowerCase().trim();
    const placa = normalizarPlaca(termino);
    const base = !termino ? this.salidas : this.salidas.filter(s =>
      s.cliente.toLowerCase().includes(termino) ||
      s.material.toLowerCase().includes(termino) ||
      (s.folio_venta ?? '').toLowerCase().includes(termino) ||
      (s.guia ?? '').toLowerCase().includes(termino) ||
      (s.chofer ?? '').toLowerCase().includes(termino) ||
      (!!placa && s.placa.includes(placa))
    );

    const conteos = {} as Record<FiltroSalida, number>;
    for (const f of this.filtros) conteos[f.value] = base.filter(s => cumpleFiltroSalida(s, f.value)).length;
    this.conteos = conteos;

    const hoy = fechaIso();
    const comoFilas = (lista: ISalida[]) => lista.map(s => ({ anulada: s.estado === 'ANULADA', cantidad: Number(s.cantidad), unidad: s.unidad }));
    this.resumenHoy = resumenDelDia(comoFilas(this.salidas.filter(s => s.fecha === hoy)));
    this.resumenPeriodo = resumenDelDia(comoFilas(this.salidas.filter(s => s.fecha >= this.fechaDesde && s.fecha <= this.fechaHasta)));

    this.salidasFiltradas = base.filter(s => cumpleFiltroSalida(s, this.filtro));
    this.cdr.markForCheck();
  }

  get volquetesPorCompletar(): number {
    return this.vehiculos.filter(faltaCompletar).length;
  }

  // ─── Plantilla ────────────────────────────────────────────────────────────

  fechaHora(fecha: string): string {
    return new Date(fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /** Llegó otro día que el que salió: pasó ese tiempo sin señal. */
  llegoOtroDia(salida: ISalida): boolean {
    return !!salida.recibida_en && fechaIso(new Date(salida.recibida_en)) !== salida.fecha;
  }

  etiquetaPropietario(propietario: PropietarioVehiculo | null): string {
    return PROPIETARIOS.find(p => p.value === propietario)?.label ?? 'Por completar';
  }

  private reemplazar(salida: ISalida) {
    this.salidas = this.salidas.map(s => s.id === salida.id ? salida : s);
    this.aplicarFiltros();
  }

  // ─── Enlazar ──────────────────────────────────────────────────────────────

  async abrirEnlazar(salida: ISalida) {
    this.salidaAEnlazar = salida;
    this.busquedaVenta = '';
    this.enlazarAbierto = true;
    this.cargandoVentas = true;
    this.cdr.markForCheck();
    try {
      // Siempre de nuevo: pudieron registrar la venta en otra pantalla para esto mismo.
      const ventas = await this.supabase.getVentas(this.empresaActiva.id);
      this.ventasParaEnlazar = ventas.filter(v => v.estado === 'ACTIVA');
    } catch (e) {
      console.error('Error cargando ventas para enlazar:', e);
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las ventas' });
    } finally {
      this.cargandoVentas = false;
      this.cdr.markForCheck();
    }
  }

  cerrarEnlazar() {
    this.enlazarAbierto = false;
    this.cdr.markForCheck();
  }

  /** Solo las líneas con la misma unidad de la salida; el servidor exige lo mismo. */
  lineasCompatibles(venta: IVenta): IVentaItem[] {
    const unidad = this.salidaAEnlazar?.unidad.trim().toLowerCase();
    return venta.venta_items.filter(i => i.unidad.trim().toLowerCase() === unidad && !esUnidadDeServicio(i.unidad));
  }

  get ventasCompatibles(): IVenta[] {
    const termino = this.busquedaVenta.trim().toLowerCase();
    return this.ventasParaEnlazar.filter(v =>
      this.lineasCompatibles(v).length > 0 &&
      (!termino || v.cliente_nombre.toLowerCase().includes(termino) || v.folio.toLowerCase().includes(termino))
    );
  }

  textoLinea(linea: IVentaItem): string {
    return `${cantidadConUnidad(Number(linea.entregado ?? 0), linea.unidad)} de ${cantidadConUnidad(Number(linea.cantidad), linea.unidad)}`;
  }

  textoFaltanteDe(venta: IVenta): string | null {
    return textoFaltanteVenta(venta);
  }

  async enlazar(linea: IVentaItem) {
    if (!this.salidaAEnlazar || !linea.id || this.guardando) return;
    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const salida = await this.supabase.enlazarSalida(this.salidaAEnlazar.id, linea.id);
      this.enlazarAbierto = false;
      this.reemplazar(salida);
      this.msg.add({ severity: 'success', summary: 'Salida enlazada', detail: `Ahora es de ${salida.folio_venta}.` });
    } catch (e: any) {
      console.error('Error al enlazar la salida:', e);
      this.msg.add({ severity: 'error', summary: 'No se enlazó', life: 8000, detail: mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') });
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Revisar y anular ─────────────────────────────────────────────────────

  pedirRevisar(salida: ISalida) {
    this.pedirTexto({
      titulo: 'Dar por revisada',
      mensaje: esSalidaSinEnlazar(salida)
        ? 'Queda sin venta y ya no se pide enlazarla. Sirve para lo que no era una venta, como un uso interno.'
        : 'Queda anotado quién la revisó y qué se decidió.',
      etiqueta: 'Qué se revisó',
      boton: 'Dar por revisada',
      peligro: false,
      exito: 'Salida revisada',
      ejecutar: nota => this.supabase.revisarSalida(salida.id, nota)
    });
  }

  pedirAnular(salida: ISalida) {
    this.pedirTexto({
      titulo: 'Anular salida',
      mensaje: `${formatoPlaca(salida.placa)}, ${cantidadConUnidad(salida.cantidad, salida.unidad)} del ${fechaCorta(salida.fecha)} deja de contar${salida.folio_venta ? ` como entregado en ${salida.folio_venta}` : ''}. Queda en el historial.`,
      etiqueta: 'Motivo',
      boton: 'Anular salida',
      peligro: true,
      exito: 'Salida anulada',
      ejecutar: motivo => this.supabase.anularSalida(salida.id, motivo)
    });
  }

  private pedirTexto(pedido: NonNullable<SalidasComponent['pedido']>) {
    this.pedido = pedido;
    this.textoMotivo = '';
    this.motivoAbierto = true;
    this.cdr.markForCheck();
  }

  cerrarMotivo() {
    this.motivoAbierto = false;
    this.cdr.markForCheck();
  }

  async confirmarMotivo() {
    if (!this.pedido || !this.textoMotivo.trim() || this.guardando) return;
    this.guardando = true;
    this.cdr.markForCheck();
    try {
      this.reemplazar(await this.pedido.ejecutar(this.textoMotivo.trim()));
      this.motivoAbierto = false;
      this.msg.add({ severity: 'success', summary: this.pedido.exito });
    } catch (e: any) {
      console.error('Error al guardar:', e);
      this.msg.add({ severity: 'error', summary: 'No se guardó', life: 8000, detail: mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') });
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Volquetes ────────────────────────────────────────────────────────────

  private volqueteVacio(): IFormularioVolquete {
    return { id: null, placa: '', capacidad_m3: null, propietario: null, chofer: '', activo: true };
  }

  abrirVolquete(vehiculo: IVehiculo | null) {
    this.volquete = vehiculo
      ? {
          id: vehiculo.id, placa: formatoPlaca(vehiculo.placa), capacidad_m3: vehiculo.capacidad_m3 === null ? null : Number(vehiculo.capacidad_m3),
          propietario: vehiculo.propietario, chofer: vehiculo.chofer ?? '', activo: vehiculo.activo
        }
      : { ...this.volqueteVacio(), capacidad_m3: Number(this.empresaActiva?.capacidad_volquete_m3 ?? 25) };
    this.mostrarFaltantesVolquete = false;
    this.volqueteAbierto = true;
    this.cdr.markForCheck();
  }

  cerrarVolquete() {
    this.volqueteAbierto = false;
    this.cdr.markForCheck();
  }

  get faltantesVolquete(): string[] {
    const falta: string[] = [];
    if (!normalizarPlaca(this.volquete.placa)) falta.push('la placa');
    if (!(Number(this.volquete.capacidad_m3) > 0)) falta.push('la capacidad');
    if (!this.volquete.propietario) falta.push('de quién es');
    return falta;
  }

  async guardarVolquete() {
    if (this.guardando) return;
    if (this.faltantesVolquete.length) {
      this.mostrarFaltantesVolquete = true;
      this.cdr.markForCheck();
      return;
    }
    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const guardado = await this.supabase.guardarVehiculo(this.empresaActiva.id, {
        id: this.volquete.id,
        placa: this.volquete.placa,
        capacidad_m3: this.volquete.capacidad_m3,
        propietario: this.volquete.propietario,
        chofer: this.volquete.chofer.trim() || null,
        activo: this.volquete.activo
      });
      this.vehiculos = [...this.vehiculos.filter(v => v.id !== guardado.id), guardado]
        .sort((a, b) => Number(b.activo) - Number(a.activo) || a.placa.localeCompare(b.placa));
      this.volqueteAbierto = false;
      this.msg.add({ severity: 'success', summary: `Volquete ${formatoPlaca(guardado.placa)} guardado` });
    } catch (e: any) {
      console.error('Error al guardar el volquete:', e);
      this.msg.add({ severity: 'error', summary: 'No se guardó', life: 8000, detail: mensajeDe(e, 'Revisa tu conexión e inténtalo de nuevo.') });
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Exportar ─────────────────────────────────────────────────────────────

  exportarCSV() {
    if (!this.salidasFiltradas.length) {
      this.msg.add({ severity: 'warn', summary: 'Sin datos', detail: 'No hay salidas para exportar' });
      return;
    }
    descargarCsv(
      `salidas_${this.empresaActiva?.nombre_comercial || 'export'}_${fechaIso()}.csv`,
      ['Fecha', 'Hora', 'Placa', 'Chofer', 'Guía', 'Cliente', 'Venta', 'Material', 'Cantidad', 'Unidad', 'Estado', 'Por revisar', 'Registró'],
      this.salidasFiltradas.map(s => [
        fechaCorta(s.fecha),
        new Date(s.registrada_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
        formatoPlaca(s.placa),
        s.chofer ?? '',
        s.guia ?? '',
        s.cliente,
        s.folio_venta ?? '',
        s.material,
        Number(s.cantidad),
        s.unidad,
        s.estado === 'ANULADA' ? 'Anulada' : 'Vigente',
        s.por_revisar ? motivosDeRevision(s).join('; ') : '',
        s.creado_por_nombre ?? ''
      ])
    );
  }
}
