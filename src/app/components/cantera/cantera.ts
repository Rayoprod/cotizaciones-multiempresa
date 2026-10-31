import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  IFilaDeHoy, ILineaCantera, IMaterialCantera, IVehiculoCantera, IVentaCantera, cantidadConUnidad, cantidadPropuesta, esUnidadDeVolumen,
  faltanteDeLinea, formatoPlaca, haceCuanto, normalizarPlaca, resumenDelDia, salidasDeHoy, volquetesConocidos
} from '../../models';
import { AuthService } from '../../services/auth';
import { ColaCampoService } from '../../services/cola-campo.service';
import { EmpresasUsuarioService } from '../../services/empresas-usuario.service';
import { SessionContextService } from '../../services/session-context.service';

const SIN_VENTA = 'sin-venta';
/** A partir de cuántas ventas se ofrece buscar. */
const VENTAS_SIN_BUSCADOR = 5;
const VOLQUETES_A_LA_VISTA = 6;

interface IFormularioSalida {
  lineaId: string | null;
  cliente: string;
  materialId: string | null;
  material: string;
  unidad: string;
  placa: string;
  /** Vacío se ve como campo vacío; el input numérico entrega null. */
  cantidad: number | null;
  chofer: string;
  guia: string;
}

/**
 * Lo que usa el encargado con el celular en la mano, casi siempre sin señal: elige
 * la venta, toca la placa y guarda. Nada de esta pantalla espera a la red; lee lo
 * guardado en el celular y ColaCampoService envía cuando se puede.
 */
@Component({
  selector: 'app-cantera',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cantera.html',
  styleUrl: './cantera.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanteraComponent implements OnInit, OnDestroy {
  readonly SIN_VENTA = SIN_VENTA;
  readonly cantidadConUnidad = cantidadConUnidad;
  readonly formatoPlaca = formatoPlaca;
  readonly unidadesSinVenta = [{ value: 'm3', label: 'm³' }, { value: 'und', label: 'und' }, { value: 'bolsa', label: 'bolsa' }];

  /**
   * computed y no un getter: cada llamada crearía filas nuevas, *ngFor rehará las
   * filas en cada refresco y el campo del motivo pediría otro refresco, sin fin.
   */
  readonly filasDeHoy = computed(() => salidasDeHoy(this.cola.locales(), this.cola.foto()?.datos.salidas_hoy ?? []));
  readonly resumenHoy = computed(() => resumenDelDia(this.filasDeHoy()));
  private readonly volquetes = computed(() => volquetesConocidos(this.cola.foto(), this.cola.locales()));

  conSenal = navigator.onLine;
  /** null mientras no se sabe, o en un navegador que no lo permite. */
  datosProtegidos: boolean | null = null;
  instalada = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  listaSinSenal = !!navigator.serviceWorker?.controller;
  errorAlmacen = false;

  /** Qué se está anotando: el id de una venta, SIN_VENTA o nada (la lista). */
  destino: string | null = null;
  private entroDesdeLaLista = false;

  busqueda = '';
  form: IFormularioSalida = this.formularioVacio();
  cantidadEditada = false;
  mostrarFaltantes = false;
  guardando = false;
  /** Lo último que se guardó: se ve al volver arriba, listo para el siguiente volquete. */
  confirmacion: string | null = null;

  anulandoId: string | null = null;
  motivoAnulacion = '';

  confirmandoSalir = false;
  private suscripcion?: Subscription;

  constructor(
    readonly cola: ColaCampoService,
    readonly session: SessionContextService,
    private auth: AuthService,
    private empresasUsuario: EmpresasUsuarioService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.session.activarModoCampo();
    this.protegerDatos();
    this.suscripcion = this.route.queryParamMap.subscribe(parametros => this.abrir(parametros.get('salida')));
    try {
      await this.cola.iniciar();
    } catch (e) {
      console.error('No se pudo leer lo guardado en el celular:', e);
      this.errorAlmacen = true;
    }
    this.prepararFormulario();
    this.cdr.markForCheck();
  }

  ngOnDestroy() {
    this.suscripcion?.unsubscribe();
    this.cola.detener();
  }

  @HostListener('window:online')
  @HostListener('window:offline')
  alCambiarConexion() {
    this.conSenal = navigator.onLine;
    this.cdr.markForCheck();
  }

  /** Sin esto, Android puede borrar lo guardado si le falta espacio. */
  private async protegerDatos() {
    try {
      this.datosProtegidos = await navigator.storage.persist();
    } catch {
      this.datosProtegidos = null;
    }
    this.cdr.markForCheck();
  }

  // ─── Lo que hay guardado ──────────────────────────────────────────────────

  get ventas(): IVentaCantera[] {
    return this.cola.foto()?.datos.ventas ?? [];
  }

  get hayBuscador(): boolean {
    return this.ventas.length > VENTAS_SIN_BUSCADOR;
  }

  get ventasFiltradas(): IVentaCantera[] {
    const termino = this.busqueda.trim().toLowerCase();
    if (!termino) return this.ventas;
    return this.ventas.filter(v => v.cliente.toLowerCase().includes(termino) || v.folio.toLowerCase().includes(termino));
  }

  private get pedidaEn(): string | null {
    return this.cola.foto()?.pedida_en ?? null;
  }

  faltante(linea: ILineaCantera): number {
    return faltanteDeLinea(linea, this.cola.locales(), this.pedidaEn);
  }

  /** "Faltan 120 m³", "Completo" o "Se pasó 5 m³". */
  textoFaltante(linea: ILineaCantera): string {
    const falta = this.faltante(linea);
    if (falta > 0) return `Faltan ${cantidadConUnidad(falta, linea.unidad)}`;
    return falta === 0 ? 'Completo' : `Se pasó ${cantidadConUnidad(-falta, linea.unidad)}`;
  }

  /** Una copia nueva no debe rehacer la fila en la que están escribiendo el motivo. */
  porId(_: number, fila: IFilaDeHoy): string {
    return fila.id;
  }

  porPlaca(_: number, volquete: IVehiculoCantera): string {
    return volquete.placa;
  }

  /** navigator.onLine puede decir que hay señal cuando no llega nada: manda el último intento. */
  get textoSenal(): string {
    if (!this.conSenal) return 'Sin señal';
    if (this.cola.fallo()) return 'Sin señal';
    return this.cola.sincronizando() ? 'Conectando…' : 'Con señal';
  }

  get haySenal(): boolean {
    return this.conSenal && !this.cola.fallo();
  }

  get copiaActualizada(): string {
    return haceCuanto(this.pedidaEn);
  }

  /** Una copia de más de un día puede no tener las ventas nuevas ni las detenidas. */
  get copiaVieja(): boolean {
    const pedida = this.pedidaEn;
    return !pedida || Date.now() - new Date(pedida).getTime() > 24 * 3600 * 1000;
  }

  get esEncargado(): boolean {
    return this.session.esEncargado();
  }

  get variasEmpresas(): boolean {
    return this.session.empresas().length > 1;
  }

  // ─── Elegir qué se anota ──────────────────────────────────────────────────
  // Va en la dirección para que el botón Atrás de Android vuelva a la lista.

  elegir(destino: string) {
    this.entroDesdeLaLista = true;
    this.router.navigate([], { relativeTo: this.route, queryParams: { salida: destino } });
  }

  volver() {
    if (this.entroDesdeLaLista) {
      this.location.back();
    } else {
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  private abrir(destino: string | null) {
    if (destino === this.destino) return;
    this.destino = destino;
    if (!destino) this.entroDesdeLaLista = false;
    this.confirmacion = null;
    this.prepararFormulario();
    this.alInicio();
    this.cdr.markForCheck();
  }

  get venta(): IVentaCantera | null {
    return this.ventas.find(v => v.id === this.destino) ?? null;
  }

  get esSinVenta(): boolean {
    return this.destino === SIN_VENTA;
  }

  /** Abierta desde un enlace viejo o la venta ya no baja: mejor volver a la lista. */
  get destinoPerdido(): boolean {
    return !!this.destino && !this.esSinVenta && !this.venta && this.cola.listo();
  }

  // ─── Formulario ───────────────────────────────────────────────────────────

  private formularioVacio(): IFormularioSalida {
    return { lineaId: null, cliente: '', materialId: null, material: '', unidad: 'm3', placa: '', cantidad: null, chofer: '', guia: '' };
  }

  private prepararFormulario() {
    this.form = this.formularioVacio();
    this.cantidadEditada = false;
    this.mostrarFaltantes = false;
    const venta = this.venta;
    if (venta) {
      // Si solo una línea tiene algo por salir, esa es.
      const conFaltante = venta.lineas.filter(l => this.faltante(l) > 0);
      const unica = conFaltante.length === 1 ? conFaltante[0] : venta.lineas.length === 1 ? venta.lineas[0] : null;
      this.form.lineaId = unica?.id ?? null;
    }
    this.proponerCantidad();
  }

  get linea(): ILineaCantera | null {
    return this.venta?.lineas.find(l => l.id === this.form.lineaId) ?? null;
  }

  get unidadActual(): string {
    return this.linea?.unidad ?? this.form.unidad;
  }

  get esVolumen(): boolean {
    return esUnidadDeVolumen(this.unidadActual);
  }

  get etiquetaCantidad(): string {
    return this.unidadesSinVenta.find(u => u.value === this.unidadActual)?.label ?? this.unidadActual;
  }

  elegirLinea(linea: ILineaCantera) {
    this.form.lineaId = linea.id;
    this.proponerCantidad();
    this.cdr.markForCheck();
  }

  get materiales(): IMaterialCantera[] {
    return this.cola.foto()?.datos.materiales ?? [];
  }

  elegirMaterial(material: IMaterialCantera) {
    this.form.materialId = material.id;
    this.form.material = material.material;
    this.form.unidad = material.unidad;
    this.proponerCantidad();
    this.cdr.markForCheck();
  }

  alEscribirMaterial() {
    this.form.materialId = null;
  }

  elegirUnidad(unidad: string) {
    this.form.unidad = unidad;
    this.proponerCantidad();
    this.cdr.markForCheck();
  }

  /** Los últimos usados o, si ya se escribió algo, los que coinciden. */
  get volquetesALaVista(): IVehiculoCantera[] {
    const escrito = normalizarPlaca(this.form.placa);
    const coinciden = escrito ? this.volquetes().filter(v => v.placa.includes(escrito)) : this.volquetes();
    return coinciden.slice(0, VOLQUETES_A_LA_VISTA);
  }

  elegirVolquete(volquete: IVehiculoCantera) {
    this.form.placa = formatoPlaca(volquete.placa);
    this.form.chofer = volquete.chofer ?? this.form.chofer;
    this.proponerCantidad();
    this.cdr.markForCheck();
  }

  alEscribirPlaca() {
    // Si escribió una placa que ya conoce, es como haberla tocado.
    const conocido = this.volquetes().find(v => v.placa === normalizarPlaca(this.form.placa));
    if (conocido && !this.form.chofer.trim()) this.form.chofer = conocido.chofer ?? '';
    this.proponerCantidad();
  }

  alEditarCantidad() {
    this.cantidadEditada = true;
  }

  /** Si la corrigió a mano, no se le vuelve a cambiar. Por unidad o bolsa no se puede adivinar. */
  private proponerCantidad() {
    if (this.cantidadEditada) return;
    if (!this.esVolumen) {
      this.form.cantidad = null;
      return;
    }
    const conocido = this.volquetes().find(v => v.placa === normalizarPlaca(this.form.placa));
    const capacidadEmpresa = Number(this.cola.foto()?.datos.capacidad_m3 ?? this.session.empresaActiva()?.capacidad_volquete_m3 ?? 25);
    this.form.cantidad = cantidadPropuesta(conocido?.capacidad_m3, capacidadEmpresa, this.linea ? this.faltante(this.linea) : null);
  }

  /** Cuánto se pasa de lo vendido con esta salida. No se impide: se avisa. */
  get exceso(): number {
    const linea = this.linea;
    if (!linea || !this.form.cantidad) return 0;
    return Math.max(0, this.form.cantidad - Math.max(0, this.faltante(linea)));
  }

  get faltantes(): string[] {
    const falta: string[] = [];
    if (this.esSinVenta) {
      if (!this.form.cliente.trim()) falta.push('para quién es');
      if (!this.form.material.trim()) falta.push('qué material');
    } else if (!this.linea) {
      falta.push('qué material');
    }
    if (!normalizarPlaca(this.form.placa)) falta.push('la placa');
    if (!(Number(this.form.cantidad) > 0)) falta.push('la cantidad');
    return falta;
  }

  async guardar() {
    if (this.guardando) return;
    if (this.faltantes.length) {
      this.mostrarFaltantes = true;
      this.cdr.markForCheck();
      return;
    }
    const venta = this.venta;
    const linea = this.linea;
    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const salida = await this.cola.registrar({
        venta_id: venta?.id ?? null,
        venta_item_id: linea?.id ?? null,
        folio_venta: venta?.folio ?? null,
        cliente: venta?.cliente ?? this.form.cliente.trim(),
        producto_id: linea?.producto_id ?? this.form.materialId,
        material: linea?.material ?? this.form.material.trim(),
        unidad: this.unidadActual,
        cantidad: Number(this.form.cantidad),
        placa: this.form.placa,
        chofer: this.form.chofer.trim() || null,
        guia: this.form.guia.trim() || null
      });
      const dicho = `${formatoPlaca(salida.placa)}: ${cantidadConUnidad(salida.cantidad, salida.unidad)} de ${salida.material}`;
      this.confirmacion = linea ? `${dicho}. ${this.textoFaltante(linea)}.` : `${dicho}.`;
      this.errorAlmacen = false;
      this.siguienteVolquete();
    } catch (e) {
      console.error('No se pudo guardar en el celular:', e);
      this.errorAlmacen = true;
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  /** Lo normal es que salgan varios seguidos: se queda en la misma venta. */
  private siguienteVolquete() {
    const { lineaId, cliente, materialId, material, unidad } = this.form;
    this.form = { ...this.formularioVacio(), lineaId, cliente, materialId, material, unidad };
    this.cantidadEditada = false;
    this.mostrarFaltantes = false;
    this.proponerCantidad();
    this.alInicio();
  }

  private alInicio() {
    this.host.nativeElement.scrollTop = 0;
  }

  // ─── Salidas de hoy ───────────────────────────────────────────────────────

  puedeAnular(fila: IFilaDeHoy): boolean {
    if (fila.anulada) return false;
    return fila.usuario_id === this.session.usuario()?.id || this.session.esAdminEmpresaActiva();
  }

  empezarAnular(fila: IFilaDeHoy) {
    this.anulandoId = fila.id;
    this.motivoAnulacion = '';
    this.cdr.markForCheck();
  }

  cancelarAnular() {
    this.anulandoId = null;
    this.cdr.markForCheck();
  }

  async confirmarAnular(fila: IFilaDeHoy) {
    const motivo = this.motivoAnulacion.trim();
    if (!motivo) return;
    try {
      await this.cola.anular(fila.id, motivo, this.cola.foto()?.datos.salidas_hoy.find(s => s.id === fila.id));
      this.anulandoId = null;
      this.errorAlmacen = false;
    } catch (e) {
      console.error('No se pudo guardar la anulación en el celular:', e);
      this.errorAlmacen = true;
    }
    this.cdr.markForCheck();
  }

  reintentar(fila: IFilaDeHoy) {
    this.cola.reintentar(fila.id);
  }

  textoEnvio(fila: IFilaDeHoy): string {
    if (fila.envio === 'con_problema') return 'Con problema';
    if (fila.envio === 'pendiente') return fila.anulada ? 'Anulada, por enviar' : 'Por enviar';
    return fila.anulada ? 'Anulada' : 'Enviada';
  }

  hora(fecha: string): string {
    return new Date(fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Este celular ─────────────────────────────────────────────────────────

  actualizar() {
    this.cola.sincronizar(true);
  }

  /** Quien también trabaja en oficina, como el dueño cuando sube a la cantera. */
  volverALaOficina() {
    this.session.salirModoCampo();
    this.router.navigate(['/']);
  }

  cambiarDeEmpresa() {
    this.session.salirModoCampo();
    this.empresasUsuario.invalidar();
    this.router.navigate(['/selector']);
  }

  pedirCerrarSesion() {
    this.confirmandoSalir = true;
    this.cdr.markForCheck();
  }

  cancelarCerrarSesion() {
    this.confirmandoSalir = false;
    this.cdr.markForCheck();
  }

  /** Lo que falta enviar se queda en el celular y sale cuando vuelva a entrar con su cuenta. */
  async cerrarSesion() {
    await this.auth.logout();
  }
}
