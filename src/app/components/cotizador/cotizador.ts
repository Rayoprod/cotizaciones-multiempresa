import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SupabaseService } from '../../services/supabase.service';
import { PdfService, lineasTotales } from '../../services/pdf.service';
import { ApiPeruService } from '../../services/api-peru.service';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputSwitchModule } from 'primeng/inputswitch';
import { SelectButtonModule } from 'primeng/selectbutton';
import { RadioButtonModule } from 'primeng/radiobutton';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SessionContextService } from '../../services/session-context.service';
import {
  extraerNombreClienteTexto, extraerDocumentoClienteTexto,
  calcularTotales, redondear2, CLAVE_BORRADOR_COTIZADOR, MODOS_IGV, UNIDADES_COMUNES,
  IBorradorCotizador, IDatosVenta, INuevaCotizacion, ModoIgv, siguienteSkuProducto, unidadMasUsada,
  datosVentaIniciales, esDocumentoValido, faltantesDatosVenta, soles
} from '../../models';
import { DatosVentaComponent } from '../ventas/datos-venta';

/** sessionStorage: la cotización que se está armando (sobrevive a una recarga). */
const CLAVE_EN_CURSO = 'cotizador-en-curso';

type TipoRegistro = 'cotizacion' | 'venta';

/** Lo que se guarda de lo que se está armando, para no perderlo al recargar. */
interface IEnCurso extends Omit<IBorradorCotizador, 'modo' | 'datos_venta'> {
  modo: IBorradorCotizador['modo'] | null;
  guardar_cliente: boolean;
  documento_origen: string | null;
  origen_cliente: 'cartera' | 'sunat' | 'manual' | null;
  tipo_registro: TipoRegistro;
  datos_venta: Partial<IDatosVenta>;
  motivo_ajuste: string;
}

@Component({
  selector: 'app-cotizador',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    ButtonModule, InputNumberModule, InputTextModule, InputSwitchModule,
    SelectButtonModule, RadioButtonModule, AutoCompleteModule, TooltipModule, InputTextareaModule,
    ProgressSpinnerModule, ConfirmDialogModule, CheckboxModule, DatosVentaComponent
  ],
  templateUrl: './cotizador.html',
  styleUrl: './cotizador.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CotizadorComponent implements OnInit, OnDestroy {

  // ── Estado de empresa ─────────────────────────────────────────────────────
  empresaActiva: any = null;

  // ── Cotización o venta directa ────────────────────────────────────────────
  // Cliente y líneas son los mismos; la venta pide además fecha, pago y entrega.
  readonly tiposRegistro: Array<{ value: TipoRegistro; label: string }> = [
    { value: 'cotizacion', label: 'Cotización' },
    { value: 'venta', label: 'Venta directa' }
  ];
  tipoRegistro: TipoRegistro = 'cotizacion';
  datosVenta: IDatosVenta = datosVentaIniciales();
  /** Solo al ajustar una venta. */
  motivoAjuste = '';
  pagadoDeLaVenta = 0;

  // ── Condiciones PDF ───────────────────────────────────────────────────────
  // Se guardan con la cotización (salvo mostrarObservaciones, que solo
  // muestra u oculta el campo de observaciones en el formulario).
  condiciones = {
    mostrarValidez: true,
    diasValidez: '15',
    mostrarCuentas: true,
    mostrarContacto: false,
    mostrarObservaciones: false
  };
  opcionesAbiertas = false;

  // ── Datos BD ──────────────────────────────────────────────────────────────
  productosBD: any[] = [];
  clientesBD: any[] = [];
  sugerenciasClientes: any[] = [];
  nombresProductosFiltrados: string[] = [];

  // ── Carrito ───────────────────────────────────────────────────────────────
  carrito: any[] = [];
  /** La línea que se está agregando al catálogo, para mostrar que está en curso. */
  agregandoAlCatalogo: any = null;

  // ── Cliente ───────────────────────────────────────────────────────────────
  /** Texto del buscador único (nombre, RUC o DNI); al elegir trae el cliente. */
  busquedaCliente: any = '';
  clienteNombre: string = '';
  clienteDocumento: string = '';
  clienteTelefono: string = '';
  clienteDireccion: string = '';
  clienteCorreo: string = '';
  clienteObservaciones: string = '';
  guardarClienteEnCartera = true;
  editandoCliente = false;
  origenCliente: 'cartera' | 'sunat' | 'manual' | null = null;

  // ── Opciones ──────────────────────────────────────────────────────────────
  readonly modosIgv = MODOS_IGV;
  /** Empieza con el modo de la empresa; se puede cambiar en cada cotización. */
  modoIgv: ModoIgv = 'sumar';
  descuento: number | null = null;

  // Lugar de entrega: las opciones son de cada empresa (Empresas → Lugares de
  // entrega). Se leen del signal para tomar la versión que refresca el layout.
  readonly opcionesLugar = computed(() =>
    (this.session.empresaActiva()?.lugares_entrega ?? []).map(lugar => ({ label: lugar, value: lugar }))
  );
  /** Lo que eligió el usuario o trajo el borrador; puede no ser una opción vigente. */
  lugarEntrega: string | null = null;

  /** El lugar que se guardará: el elegido si sigue siendo una opción; si no, la primera. */
  get lugarSeleccionado(): string | null {
    const opciones = this.opcionesLugar().map(o => o.value);
    if (this.lugarEntrega && opciones.includes(this.lugarEntrega)) return this.lugarEntrega;
    return opciones[0] ?? null;
  }

  // ── Totales ───────────────────────────────────────────────────────────────
  subtotalGeneral: number = 0;
  descuentoAplicado: number = 0;
  igvTotal: number = 0;
  totalFinal: number = 0;

  // ── Revisión / duplicado abierto desde el historial, o ajuste de una venta ─
  borradorModo: IBorradorCotizador['modo'] | null = null;
  borradorOrigenId: string | null = null;
  borradorFolioPadre: string | null = null;
  /** RUC/DNI de la cotización que se revisa, para avisar si cambia de cliente. */
  documentoOrigen: string | null = null;
  /** Se recuperó una cotización a medio armar (p. ej. tras recargar la página). */
  recuperadaDeSesion = false;

  // ── Estado de la vista ────────────────────────────────────────────────────
  cargando = true;
  guardando = false;
  buscandoDocumento = false;
  /** Tras intentar guardar con datos incompletos se muestra qué falta. */
  mostrarFaltantes = false;
  private temporizadorEnCurso: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private supabaseSvc: SupabaseService,
    private pdfSvc: PdfService,
    private router: Router,
    private messageService: MessageService,
    private confirmationSvc: ConfirmationService,
    private apiPeru: ApiPeruService,
    private session: SessionContextService
  ) { }

  // ── Init ──────────────────────────────────────────────────────────────────

  async ngOnInit() {
    this.cargando = true;

    this.empresaActiva = this.session.empresaActiva();

    if (!this.empresaActiva?.id) {
      this.cargando = false;
      this.router.navigate(['/selector']);
      return;
    }

    this.condiciones.mostrarCuentas = this.empresaActiva?.mostrar_cuentas ?? true;
    this.condiciones.mostrarContacto = !(this.empresaActiva?.mostrar_cuentas ?? true);
    this.modoIgv = this.modoIgvDeLaEmpresa;

    const borradorCargado = this.cargarBorradorSiExiste() || this.recuperarEnCurso();
    if (this.puedeElegirTipo && this.router.parseUrl(this.router.url).queryParams['tipo'] === 'venta') {
      this.tipoRegistro = 'venta';
    }
    if (!borradorCargado && this.carrito.length === 0) {
      this.agregarFila();
    }

    await this.cargarDatosDesdeBD();

    if (!borradorCargado && !this.tieneCliente && !this.carrito.some(i => i.descripcion?.trim())) {
      this.modoIgv = this.modoIgvDeLaEmpresa;
      this.recalcularTodo();
    }

    this.cargando = false;
    this.cdr.markForCheck();
  }

  ngOnDestroy() {
    // Si se sale del cotizador antes de que corra el guardado diferido.
    if (this.temporizadorEnCurso) {
      clearTimeout(this.temporizadorEnCurso);
      this.guardarEnCurso();
    }
  }

  // ── Validación ────────────────────────────────────────────────────────────

  private esItemValido(item: any): boolean {
    return !!item.descripcion?.trim() &&
      item.precio_unitario !== null && item.precio_unitario !== undefined &&
      Number(item.precio_unitario) >= 0 &&
      Number(item.cantidad) > 0;
  }

  get tieneItemsValidos(): boolean {
    return this.carrito.some(item => this.esItemValido(item));
  }

  get puedeGenerar(): boolean {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    return this.faltantes.length === 0 && !!empresa?.id;
  }

  get esVenta(): boolean {
    return this.tipoRegistro === 'venta';
  }

  /** Una revisión sigue siendo cotización y un ajuste sigue siendo venta. */
  get puedeElegirTipo(): boolean {
    return this.borradorModo !== 'revision' && this.borradorModo !== 'ajuste';
  }

  get esAjuste(): boolean {
    return this.borradorModo === 'ajuste';
  }

  elegirTipo(tipo: TipoRegistro) {
    this.tipoRegistro = tipo;
    this.marcarCambio();
  }

  get descuentoValido(): boolean {
    return (this.descuento ?? 0) <= this.subtotalGeneral;
  }

  /** Del signal: el layout lo refresca al entrar, y lo guardado en la pestaña puede ser anterior. */
  private get modoIgvDeLaEmpresa(): ModoIgv {
    return this.session.empresaActiva()?.modo_igv ?? this.empresaActiva?.modo_igv ?? 'sumar';
  }

  /** Lo que falta para poder guardar, en palabras. */
  get faltantes(): string[] {
    const falta: string[] = [];
    if (!this.clienteNombreTexto || !this.clienteDocumentoTexto) falta.push('el cliente (nombre y RUC/DNI)');
    if (!this.tieneItemsValidos) falta.push('al menos un ítem con cantidad y precio');
    if (!this.descuentoValido) falta.push('un descuento que no supere el subtotal');
    if (this.esVenta) {
      if (this.clienteDocumentoTexto && !esDocumentoValido(this.clienteDocumentoTexto)) falta.push('un RUC de 11 dígitos o un DNI de 8');
      falta.push(...faltantesDatosVenta(this.datosVenta, this.totalFinal));
    }
    if (this.esAjuste) {
      if (this.totalFinal < this.pagadoDeLaVenta) falta.push(`un total de al menos ${soles(this.pagadoDeLaVenta)}, lo que ya se pagó`);
      if (!this.motivoAjuste.trim()) falta.push('el motivo del ajuste');
    }
    return falta;
  }

  // ── Carga inicial ─────────────────────────────────────────────────────────

  async cargarDatosDesdeBD() {
    try {
      const empresaId = this.empresaActiva?.id;
      if (!empresaId) return;

      const [prods, clis] = await Promise.all([
        this.supabaseSvc.getProductos(empresaId),
        this.supabaseSvc.getClientes(empresaId)
      ]);

      this.productosBD = prods || [];
      this.clientesBD = clis || [];
      // Las líneas vacías toman la unidad que más usa esta empresa.
      for (const item of this.carrito) {
        if (!item.descripcion?.trim()) item.unidad = this.unidadPorDefecto;
      }
    } catch (e) {
      console.error('Error cargando datos:', e);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudieron cargar productos o clientes.'
      });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  // ── Cliente ───────────────────────────────────────────────────────────────

  obtenerNombreClienteTexto(val: any): string {
    return extraerNombreClienteTexto(val);
  }

  get clienteNombreTexto(): string {
    return this.obtenerNombreClienteTexto(this.clienteNombre);
  }

  get clienteDocumentoTexto(): string {
    return extraerDocumentoClienteTexto(this.clienteDocumento);
  }

  get tieneCliente(): boolean {
    return !!this.clienteNombreTexto || !!this.clienteDocumentoTexto;
  }

  get tipoDocumento(): string {
    const largo = this.clienteDocumentoTexto.length;
    return largo === 11 ? 'RUC' : largo === 8 ? 'DNI' : 'Doc.';
  }

  get contactoCliente(): string {
    return [this.clienteTelefono?.trim(), this.clienteCorreo?.trim()].filter(Boolean).join(' · ');
  }

  get clienteYaRegistrado(): boolean {
    const doc = this.clienteDocumentoTexto;
    return !!doc && this.clientesBD.some(c => String(c.documento_identidad || '').trim() === doc);
  }

  /** La revisión quedó con otro RUC/DNI: al guardar se anula la cotización de otro cliente. */
  get clienteCambiadoEnRevision(): boolean {
    return this.borradorModo === 'revision' && !!this.documentoOrigen && !!this.clienteDocumentoTexto
      && this.clienteDocumentoTexto !== this.documentoOrigen;
  }

  /** Si lo escrito en el buscador es un RUC (11) o DNI (8), ese número. */
  get documentoBuscable(): string | null {
    const texto = typeof this.busquedaCliente === 'string' ? this.busquedaCliente.trim() : '';
    return /^\d{8}$|^\d{11}$/.test(texto) ? texto : null;
  }

  filtrarClientes(event: { query: string }) {
    const q = (event.query || '').toLowerCase().trim();
    this.sugerenciasClientes = this.clientesBD
      .filter(c =>
        c.nombre_razon_social?.toLowerCase().includes(q) ||
        String(c.documento_identidad || '').includes(q)
      )
      .slice(0, 8);
    this.cdr.markForCheck();
  }

  elegirCliente(cliente: any) {
    if (!cliente || typeof cliente !== 'object') return;
    this.clienteNombre = cliente.nombre_razon_social || '';
    this.clienteDocumento = cliente.documento_identidad || '';
    this.clienteTelefono = cliente.telefono || '';
    this.clienteDireccion = cliente.direccion || '';
    this.clienteCorreo = cliente.correo || '';
    this.origenCliente = 'cartera';
    this.busquedaCliente = '';
    this.editandoCliente = false;
    this.marcarCambio();
    this.cdr.markForCheck();
  }

  /** Enter en el buscador: si es un RUC o DNI, se consulta. */
  alPresionarEnterBusqueda() {
    if (this.documentoBuscable) this.buscarEnSunat();
  }

  /**
   * Busca el documento primero en la cartera (no gasta consultas) y, si no
   * está, en SUNAT/RENIEC. Solo se llama al presionar el botón o Enter.
   */
  async buscarEnSunat(documento?: string) {
    if (this.buscandoDocumento) return;
    const doc = (documento ?? this.documentoBuscable ?? this.clienteDocumentoTexto ?? '').trim();

    if (!/^\d{8}$|^\d{11}$/.test(doc)) {
      this.messageService.add({ severity: 'warn', summary: 'Documento inválido', detail: 'Escribe un DNI de 8 dígitos o un RUC de 11.' });
      return;
    }

    const enCartera = this.clientesBD.find(c => String(c.documento_identidad || '').trim() === doc);
    if (enCartera) {
      this.elegirCliente(enCartera);
      return;
    }

    this.buscandoDocumento = true;
    this.cdr.markForCheck();
    try {
      const datos = await this.apiPeru.buscarDocumento(doc);
      this.clienteNombre = datos.nombre;
      this.clienteDocumento = doc;
      this.clienteDireccion = datos.direccion;
      this.clienteTelefono = '';
      this.clienteCorreo = '';
      this.origenCliente = 'sunat';
      this.busquedaCliente = '';
      this.marcarCambio();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'No encontrado', detail: e?.message || 'No se pudo consultar el documento.' });
    } finally {
      this.buscandoDocumento = false;
      this.cdr.markForCheck();
    }
  }

  /** El botón de búsqueda dentro de los datos del cliente. */
  buscarDocumento() {
    return this.buscarEnSunat(this.clienteDocumentoTexto);
  }

  ingresarManual() {
    const texto = typeof this.busquedaCliente === 'string' ? this.busquedaCliente.trim() : '';
    if (/^\d+$/.test(texto)) {
      this.clienteDocumento = texto;
    } else if (texto) {
      this.clienteNombre = texto;
    }
    this.busquedaCliente = '';
    this.origenCliente = 'manual';
    this.editandoCliente = true;
    this.cdr.markForCheck();
  }

  cambiarCliente() {
    this.clienteNombre = '';
    this.clienteDocumento = '';
    this.clienteTelefono = '';
    this.clienteDireccion = '';
    this.clienteCorreo = '';
    this.origenCliente = null;
    this.editandoCliente = false;
    this.marcarCambio();
    this.cdr.markForCheck();
    setTimeout(() => document.getElementById('buscar-cliente')?.focus());
  }

  terminarEdicionCliente() {
    if (!this.clienteNombreTexto || !this.clienteDocumentoTexto) {
      this.mostrarFaltantes = true;
      return;
    }
    this.editandoCliente = false;
  }

  // Al escribir el documento solo se busca en la cartera (no gasta consultas).
  alCambiarDocumentoInput() {
    const doc = this.clienteDocumentoTexto;
    if ((doc.length !== 8 && doc.length !== 11) || this.clienteNombre) return;

    const clienteExistente = this.clientesBD.find(
      c => String(c.documento_identidad || '').trim() === doc
    );
    if (clienteExistente) {
      this.clienteNombre = clienteExistente.nombre_razon_social || '';
      this.clienteDireccion = clienteExistente.direccion || '';
      this.clienteTelefono = clienteExistente.telefono || '';
      this.clienteCorreo = clienteExistente.correo || '';
      this.cdr.markForCheck();
    }
  }

  // ── Carrito ───────────────────────────────────────────────────────────────
  // `sku` solo se llena cuando la línea corresponde a un producto del
  // catálogo; las líneas libres no llevan código.

  agregarFila() {
    this.carrito = [...this.carrito, {
      sku: null,
      descripcion: '',
      unidad: this.unidadPorDefecto,
      cantidad: null,
      precio_unitario: null,
      subtotal: 0
    }];
  }

  /** Agrega una fila y lleva el cursor a su descripción. */
  agregarFilaYEnfocar() {
    this.agregarFila();
    this.cdr.markForCheck();
    const indice = this.carrito.length - 1;
    setTimeout(() => {
      const escritorio = document.getElementById(`item-desc-${indice}`);
      const destino = escritorio?.offsetParent ? escritorio : document.getElementById(`item-desc-m-${indice}`);
      destino?.focus();
    });
  }

  /**
   * Enter en cantidad o precio: pasa a una fila nueva (o a la siguiente).
   * El preventDefault evita el keypress de p-inputNumber, que con el texto
   * seleccionado (al llegar con Tab) reemplaza el valor por el Enter y lo borra.
   */
  alEnterEnFila(indice: number, event?: Event) {
    event?.preventDefault();
    if (indice === this.carrito.length - 1) {
      this.agregarFilaYEnfocar();
    } else {
      document.getElementById(`item-desc-${indice + 1}`)?.focus();
    }
  }

  eliminarItem(index: number) {
    this.carrito = this.carrito.filter((_, i) => i !== index);
    if (this.carrito.length === 0) this.agregarFila();
    this.recalcularTodo();
  }

  porIndice(indice: number): number {
    return indice;
  }

  private get unidadPorDefecto(): string {
    return unidadMasUsada(this.productosBD);
  }

  /** Las unidades comunes, más la del catálogo o de la cotización original si es otra. */
  unidadesDe(item: any): Array<{ value: string; label: string }> {
    const propias = new Set([item.unidad, ...this.productosBD.map(p => p.unidad)].map(u => String(u ?? '').trim()).filter(Boolean));
    const conocidas = new Set(UNIDADES_COMUNES.map(u => u.value));
    return [
      ...UNIDADES_COMUNES,
      ...[...propias].filter(u => !conocidas.has(u)).map(u => ({ value: u, label: u }))
    ];
  }

  /** Línea escrita a mano: sale en la cotización, pero no cuenta para el catálogo. */
  lineaFueraDeCatalogo(item: any): boolean {
    return !!item.descripcion?.trim() && !item.sku;
  }

  async agregarAlCatalogo(item: any) {
    const descripcion = String(item.descripcion ?? '').trim().replace(/\s+/g, ' ');
    if (!descripcion || this.agregandoAlCatalogo || !this.empresaActiva?.id) return;

    this.agregandoAlCatalogo = item;
    this.cdr.markForCheck();
    try {
      const creado = await this.supabaseSvc.guardarProducto({
        codigo_sku: siguienteSkuProducto(this.productosBD),
        descripcion,
        unidad: item.unidad || this.unidadPorDefecto,
        precio_unitario_base: Number(item.precio_unitario) || 0,
        empresa_id: this.empresaActiva.id
      });
      this.productosBD = [...this.productosBD, creado];
      item.descripcion = descripcion;
      item.sku = creado.codigo_sku;
      this.marcarCambio();
    } catch (e: any) {
      console.error('Error al agregar al catálogo:', e);
      this.messageService.add({
        severity: 'error', summary: 'No se agregó al catálogo',
        detail: e?.message || 'Revisa tu conexión e inténtalo de nuevo.'
      });
    } finally {
      this.agregandoAlCatalogo = null;
      this.cdr.markForCheck();
    }
  }

  filtrarNombresProductos(event: any) {
    const query = (event.query || '').toLowerCase();
    const productos = this.productosBD
      .filter(p => p.descripcion?.toLowerCase().includes(query))
      .map(p => p.descripcion)
      .filter(Boolean);
    this.nombresProductosFiltrados = Array.from(new Set(productos));
    this.cdr.markForCheck();
  }

  alElegirProductoSugerido(event: any, item: any) {
    const val = typeof event === 'string' ? event : (event?.value || event);
    const busqueda = String(val || '').toLowerCase().trim();
    const producto = this.productosBD.find(
      p => p.descripcion?.toLowerCase().trim() === busqueda
    );
    if (producto) {
      item.sku = producto.codigo_sku;
      item.descripcion = producto.descripcion;
      item.unidad = producto.unidad || this.unidadPorDefecto;
      item.precio_unitario = producto.precio_unitario_base;
      item.cantidad = item.cantidad || 1;
      this.recalcularItem(item);
    }
  }

  alCambiarDescripcion(item: any) {
    const prodMatch = item.descripcion?.trim()
      ? this.productosBD.find(
          p => p.descripcion?.toLowerCase().trim() === String(item.descripcion).toLowerCase().trim()
        )
      : null;

    const cambioDeProducto = !!prodMatch && prodMatch.codigo_sku !== item.sku;
    item.sku = prodMatch?.codigo_sku ?? null;
    if (prodMatch) {
      if (cambioDeProducto && prodMatch.unidad) {
        item.unidad = prodMatch.unidad;
      }
      if (item.precio_unitario === null || item.precio_unitario === undefined) {
        item.precio_unitario = prodMatch.precio_unitario_base;
      }
      if (!item.cantidad) {
        item.cantidad = 1;
      }
    }
    this.recalcularItem(item);
  }

  recalcularItem(item: any) {
    item.subtotal = redondear2((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0));
    this.recalcularTodo();
  }

  recalcularTodo() {
    const totales = calcularTotales(this.carrito.filter(item => this.esItemValido(item)), this.modoIgv, this.descuento);
    this.subtotalGeneral = totales.subtotal;
    this.descuentoAplicado = totales.descuento;
    this.igvTotal = totales.igv;
    this.totalFinal = totales.total;
    this.marcarCambio();
    this.cdr.markForCheck();
  }

  get ayudaModoIgv(): string {
    return this.modosIgv.find(m => m.value === this.modoIgv)?.ayuda ?? '';
  }

  get etiquetaTotal(): string {
    if (this.modoIgv === 'incluido') return 'Total, IGV incluido';
    return this.modoIgv === 'sumar' ? 'Total con IGV' : 'Total sin IGV';
  }

  /** Lo que compone el total, en una línea, bajo la cifra de la barra inferior. */
  get detalleTotal(): string {
    if (this.totalFinal <= 0 && this.descuentoAplicado <= 0) return '';
    const partes: string[] = [];
    if (this.modoIgv === 'sumar' || this.descuentoAplicado > 0) partes.push(`Subtotal ${soles(this.subtotalGeneral)}`);
    if (this.descuentoAplicado > 0) partes.push(`Descuento -${soles(this.descuentoAplicado)}`);
    if (this.modoIgv === 'sumar') partes.push(`IGV ${soles(this.igvTotal)}`);
    if (this.modoIgv === 'incluido') partes.push(`Incluye IGV ${soles(this.igvTotal)}`);
    return partes.join(' · ');
  }

  get tituloDocumento(): string {
    if (this.esAjuste) return `Ajustar ${this.borradorFolioPadre}`;
    if (this.borradorModo === 'revision') return `Revisión de ${this.borradorFolioPadre}`;
    if (this.borradorModo === 'duplicar' && this.borradorFolioPadre) return `Copia de ${this.borradorFolioPadre}`;
    return this.esVenta ? 'Nueva venta' : 'Nueva cotización';
  }

  get textoGuardar(): string {
    if (this.esAjuste) return 'Guardar ajuste';
    return this.esVenta ? 'Registrar venta' : 'Guardar y descargar PDF';
  }

  get textoGuardarCorto(): string {
    if (this.esAjuste) return 'Guardar';
    return this.esVenta ? 'Registrar' : 'Guardar PDF';
  }

  get iconoGuardar(): string {
    return this.esVenta ? 'pi pi-check' : 'pi pi-file-pdf';
  }

  get filasTotales() {
    return lineasTotales({
      subtotal: this.subtotalGeneral,
      descuento_global: this.descuentoAplicado,
      igv: this.igvTotal,
      incluye_igv: this.modoIgv !== 'sin_igv',
      precios_con_igv: this.modoIgv === 'incluido'
    });
  }

  /** Un lugar heredado (revisión, duplicado) que la empresa ya no ofrece. */
  get lugarYaNoDisponible(): string | null {
    const opciones = this.opcionesLugar().map(o => o.value);
    return this.lugarEntrega && !opciones.includes(this.lugarEntrega) ? this.lugarEntrega : null;
  }

  /** Lo que saldrá en el PDF, para verlo de un vistazo sin abrir las opciones. */
  get condicionesActivas(): Array<{ icono: string; texto: string }> {
    const activas: Array<{ icono: string; texto: string }> = [];
    if (this.lugarSeleccionado) activas.push({ icono: 'pi pi-map-marker', texto: this.lugarSeleccionado });
    if (this.condiciones.mostrarValidez && !this.esVenta) activas.push({ icono: 'pi pi-clock', texto: `Validez ${this.condiciones.diasValidez} días` });
    if (this.condiciones.mostrarCuentas && this.empresaActiva?.mostrar_cuentas !== false) {
      activas.push({ icono: 'pi pi-building', texto: 'Cuentas bancarias' });
    }
    if (this.condiciones.mostrarContacto && !this.esVenta) activas.push({ icono: 'pi pi-user', texto: 'Contacto de aprobación' });
    if (this.condiciones.mostrarObservaciones) activas.push({ icono: 'pi pi-comment', texto: 'Observaciones' });
    return activas;
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  guardar() {
    if (this.esAjuste) return this.guardarAjuste();
    return this.esVenta ? this.registrarVenta() : this.generarPDF();
  }

  /** Lo común a guardar cualquier documento: que no falte nada y que haya conexión. */
  private listoParaGuardar(): boolean {
    if (this.guardando) return false;
    if (!this.puedeGenerar) {
      this.mostrarFaltantes = true;
      this.cdr.markForCheck();
      return false;
    }
    if (!navigator.onLine) {
      this.messageService.add({
        severity: 'error', summary: 'Sin conexión', detail: 'Conéctate a internet para guardar.'
      });
      return false;
    }
    this.empresaActiva = this.empresaActiva || this.session.empresaActiva();
    return true;
  }

  private get clienteParaGuardar(): INuevaCotizacion['cliente'] {
    return {
      nombre: this.clienteNombreTexto,
      documento: this.clienteDocumentoTexto,
      telefono: this.clienteTelefono?.trim() || null,
      direccion: this.clienteDireccion?.trim() || null,
      correo: this.clienteCorreo?.trim() || null
    };
  }

  private lineaParaGuardar(item: any) {
    return {
      sku: item.sku || null,
      descripcion: String(item.descripcion).trim(),
      unidad: String(item.unidad ?? '').trim() || this.unidadPorDefecto,
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario)
    };
  }

  private get lineasValidas(): any[] {
    return this.carrito.filter(item => this.esItemValido(item));
  }

  private get observacionesParaGuardar(): string | null {
    return this.condiciones.mostrarObservaciones ? (this.clienteObservaciones?.trim() || null) : null;
  }

  /** Los rechazos de las funciones de Postgres ya vienen en español. */
  private avisarRechazo(resumen: string, error: any, siNoHayMotivo: string) {
    console.error(resumen, error);
    const esDelServidor = ['22023', 'P0001', '42501'].includes(error?.code) && error?.message;
    this.messageService.add({
      severity: 'error', summary: resumen, life: 8000,
      detail: esDelServidor ? error.message : siNoHayMotivo
    });
  }

  async generarPDF() {
    if (!this.listoParaGuardar()) return;

    const diasValidez = Number(this.condiciones.diasValidez);
    if (this.condiciones.mostrarValidez && !(Number.isInteger(diasValidez) && diasValidez >= 1 && diasValidez <= 365)) {
      this.opcionesAbiertas = true;
      this.messageService.add({
        severity: 'warn', summary: 'Validez inválida', detail: 'La validez de la oferta debe ser un número de días entre 1 y 365.'
      });
      return;
    }

    const nueva: INuevaCotizacion = {
      empresaId: this.empresaActiva.id,
      cliente: this.clienteParaGuardar,
      items: this.lineasValidas.map(item => this.lineaParaGuardar(item)),
      modoIgv: this.modoIgv,
      descuento: this.descuentoAplicado,
      lugarEntrega: this.lugarSeleccionado,
      observaciones: this.observacionesParaGuardar,
      condiciones: {
        mostrarValidez: this.condiciones.mostrarValidez,
        diasValidez: this.condiciones.mostrarValidez ? diasValidez : 15,
        mostrarCuentas: this.condiciones.mostrarCuentas,
        mostrarContacto: this.condiciones.mostrarContacto
      },
      origen: this.borradorOrigenId && this.borradorModo
        ? { id: this.borradorOrigenId, tipo: this.borradorModo === 'revision' ? 'revision' : 'duplicado' }
        : null,
      guardarCliente: this.guardarClienteEnCartera
    };

    this.guardando = true;
    this.cdr.markForCheck();

    let guardada;
    try {
      guardada = await this.supabaseSvc.crearCotizacion(nueva);
    } catch (error: any) {
      this.avisarRechazo('No se guardó la cotización', error, 'Revisa tu conexión e inténtalo de nuevo. No se generó ningún folio.');
      this.guardando = false;
      this.cdr.markForCheck();
      return;
    }

    try {
      await this.pdfSvc.generarYDescargarCotizacion(guardada, this.empresaActiva);
      this.messageService.add({
        severity: 'success', summary: `Cotización ${guardada.folio} guardada`, detail: 'El PDF se está descargando.'
      });
    } catch (pdfError) {
      console.error('Error al generar PDF:', pdfError);
      this.messageService.add({
        severity: 'warn',
        summary: `Cotización ${guardada.folio} guardada`,
        detail: 'No se pudo generar el PDF. Descárgalo desde Cotizaciones.',
        life: 8000
      });
    }

    if (nueva.guardarCliente) {
      this.supabaseSvc.getClientes(this.empresaActiva.id)
        .then(clientes => { this.clientesBD = clientes || []; })
        .catch(() => { /* la lista se recarga al volver a entrar */ });
    }

    this.resetearFormulario();
    this.guardando = false;
    this.cdr.markForCheck();
  }

  async registrarVenta() {
    if (!this.listoParaGuardar()) return;

    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const venta = await this.supabaseSvc.crearVenta({
        empresaId: this.empresaActiva.id,
        cliente: this.clienteParaGuardar,
        items: this.lineasValidas.map(item => this.lineaParaGuardar(item)),
        modoIgv: this.modoIgv,
        descuento: this.descuentoAplicado,
        lugarEntrega: this.lugarSeleccionado,
        observaciones: this.observacionesParaGuardar,
        condiciones: { mostrarCuentas: this.condiciones.mostrarCuentas },
        datosVenta: this.datosVenta,
        guardarCliente: this.guardarClienteEnCartera
      });
      this.resetearFormulario();
      this.messageService.add({ severity: 'success', summary: `Venta ${venta.folio} registrada` });
      this.router.navigate(['/ventas'], { queryParams: { venta: venta.id } });
    } catch (error: any) {
      this.avisarRechazo('No se registró la venta', error, 'Revisa tu conexión e inténtalo de nuevo. No se generó ningún folio.');
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  async guardarAjuste() {
    if (!this.listoParaGuardar() || !this.borradorOrigenId) return;

    this.guardando = true;
    this.cdr.markForCheck();
    try {
      const venta = await this.supabaseSvc.ajustarVenta({
        ventaId: this.borradorOrigenId,
        // Las líneas que siguen conservan su id: las salidas se ligarán a ellas.
        items: this.lineasValidas.map(item => ({ id: item.id ?? null, ...this.lineaParaGuardar(item) })),
        modoIgv: this.modoIgv,
        descuento: this.descuentoAplicado,
        lugarEntrega: this.lugarSeleccionado,
        observaciones: this.observacionesParaGuardar,
        datosVenta: this.datosVenta,
        motivo: this.motivoAjuste.trim()
      });
      this.resetearFormulario();
      this.messageService.add({ severity: 'success', summary: `Venta ${venta.folio} ajustada` });
      this.router.navigate(['/ventas'], { queryParams: { venta: venta.id } });
    } catch (error: any) {
      this.avisarRechazo('No se guardó el ajuste', error, 'Revisa tu conexión e inténtalo de nuevo. La venta no cambió.');
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  private resetearFormulario() {
    sessionStorage.removeItem(CLAVE_BORRADOR_COTIZADOR);
    this.limpiarEnCurso();
    if (this.esAjuste) this.tipoRegistro = 'cotizacion';
    this.datosVenta              = datosVentaIniciales();
    this.motivoAjuste            = '';
    this.pagadoDeLaVenta         = 0;
    this.busquedaCliente         = '';
    this.clienteNombre           = '';
    this.clienteDocumento        = '';
    this.clienteTelefono         = '';
    this.clienteDireccion        = '';
    this.clienteCorreo           = '';
    this.clienteObservaciones    = '';
    this.origenCliente           = null;
    this.editandoCliente         = false;
    this.guardarClienteEnCartera = true;
    this.lugarEntrega            = null;
    this.modoIgv                 = this.modoIgvDeLaEmpresa;
    this.descuento               = null;
    this.carrito                 = [];
    this.borradorModo            = null;
    this.borradorOrigenId        = null;
    this.borradorFolioPadre      = null;
    this.documentoOrigen         = null;
    this.recuperadaDeSesion      = false;
    this.mostrarFaltantes        = false;
    this.agregarFila();
    this.recalcularTodo();
    this.limpiarEnCurso();
  }

  // ── Cotización en curso (sobrevive a recargas) ────────────────────────────

  private get claveEnCurso(): string {
    const usuario = this.session.usuario?.()?.id ?? 'sin-usuario';
    return `${CLAVE_EN_CURSO}:${usuario}:${this.empresaActiva?.id ?? 'sin-empresa'}`;
  }

  /** Guarda la cotización en curso un momento después del último cambio. */
  marcarCambio() {
    if (this.temporizadorEnCurso) clearTimeout(this.temporizadorEnCurso);
    this.temporizadorEnCurso = setTimeout(() => {
      this.temporizadorEnCurso = null;
      this.guardarEnCurso();
    }, 600);
  }

  private guardarEnCurso() {
    if (!this.empresaActiva?.id) return;
    const hayAlgo = this.tieneCliente || this.carrito.some(i => i.descripcion?.trim());
    if (!hayAlgo) {
      this.limpiarEnCurso();
      return;
    }
    const enCurso: IEnCurso = {
      modo: this.borradorModo,
      origen_id: this.borradorOrigenId,
      folio_origen: this.borradorFolioPadre,
      cliente_nombre: this.clienteNombreTexto,
      cliente_documento: this.clienteDocumentoTexto,
      cliente_telefono: this.clienteTelefono,
      cliente_direccion: this.clienteDireccion,
      cliente_correo: this.clienteCorreo,
      observaciones: this.clienteObservaciones,
      lugar_entrega: this.lugarEntrega,
      modo_igv: this.modoIgv,
      descuento: this.descuento ?? 0,
      documento_origen: this.documentoOrigen,
      origen_cliente: this.origenCliente,
      condiciones: { ...this.condiciones, diasValidez: Number(this.condiciones.diasValidez) || 15 },
      items: this.carrito,
      guardar_cliente: this.guardarClienteEnCartera,
      tipo_registro: this.tipoRegistro,
      datos_venta: this.datosVenta,
      motivo_ajuste: this.motivoAjuste,
      pagado: this.pagadoDeLaVenta
    };
    try {
      sessionStorage.setItem(this.claveEnCurso, JSON.stringify(enCurso));
    } catch { /* sin almacenamiento: no se recupera, pero se puede seguir */ }
  }

  private limpiarEnCurso() {
    if (this.temporizadorEnCurso) {
      clearTimeout(this.temporizadorEnCurso);
      this.temporizadorEnCurso = null;
    }
    try { sessionStorage.removeItem(this.claveEnCurso); } catch { /* sin almacenamiento */ }
  }

  private recuperarEnCurso(): boolean {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(this.claveEnCurso); } catch { return false; }
    if (!raw) return false;
    try {
      const enCurso: IEnCurso = JSON.parse(raw);
      this.aplicarBorrador(enCurso);
      this.guardarClienteEnCartera = enCurso.guardar_cliente ?? true;
      this.recuperadaDeSesion = true;
      return true;
    } catch {
      this.limpiarEnCurso();
      return false;
    }
  }

  descartarRecuperada() {
    this.resetearFormulario();
    this.cdr.markForCheck();
  }

  // ── Borrador desde el historial ───────────────────────────────────────────

  private cargarBorradorSiExiste(): boolean {
    const raw = sessionStorage.getItem(CLAVE_BORRADOR_COTIZADOR);
    if (!raw) return false;
    sessionStorage.removeItem(CLAVE_BORRADOR_COTIZADOR);

    try {
      // Las claves folio_padre / cotizacion_id son de la versión anterior.
      const b: IBorradorCotizador & { folio_padre?: string; cotizacion_id?: string } = JSON.parse(raw);
      this.aplicarBorrador({
        ...b,
        origen_id: b.origen_id ?? b.cotizacion_id ?? null,
        folio_origen: b.folio_origen ?? b.folio_padre ?? null
      });
      // Abrir una revisión o un duplicado reemplaza lo que se estaba armando.
      this.limpiarEnCurso();
      this.marcarCambio();
      return true;
    } catch (e) {
      console.error('Error al cargar borrador:', e);
      return false;
    }
  }

  private aplicarBorrador(b: Partial<IEnCurso>) {
    this.clienteNombre        = b.cliente_nombre    || '';
    this.clienteDocumento     = b.cliente_documento || '';
    this.clienteTelefono      = b.cliente_telefono  || '';
    this.clienteDireccion     = b.cliente_direccion || '';
    this.clienteCorreo        = b.cliente_correo    || '';
    this.origenCliente        = b.origen_cliente ?? (this.clienteNombre ? 'cartera' : null);
    // Las cotizaciones viejas guardaban "[Revisión de X]" en observaciones.
    this.clienteObservaciones = (b.observaciones || '').replace(/^\[(Revisión|Duplicado) de [^\]]+\]\s*/, '');
    this.condiciones.mostrarObservaciones = !!this.clienteObservaciones;
    this.lugarEntrega         = b.lugar_entrega     || null;
    if (b.modo_igv) this.modoIgv = b.modo_igv;
    this.descuento            = b.descuento || null;
    if (b.condiciones && Object.keys(b.condiciones).length > 0) {
      const { diasValidez, ...resto } = b.condiciones;
      Object.assign(this.condiciones, resto);
      if (diasValidez) this.condiciones.diasValidez = String(diasValidez);
    }

    if (b.items?.length) {
      this.carrito = b.items.map(item => ({
        ...(item.id ? { id: item.id } : {}),
        // Los códigos VAR-/MAQ- eran aleatorios, no de un producto real.
        sku:             item.sku && !/^(VAR|MAQ)-/.test(item.sku) ? item.sku : null,
        descripcion:     item.descripcion     || '',
        unidad:          item.unidad          || this.unidadPorDefecto,
        cantidad:        item.cantidad        ?? null,
        precio_unitario: item.precio_unitario ?? null,
        subtotal:        redondear2((item.cantidad || 0) * (item.precio_unitario || 0))
      }));
    }

    this.borradorModo       = b.modo || null;
    this.borradorOrigenId   = b.origen_id ?? null;
    this.borradorFolioPadre = b.folio_origen ?? null;
    this.documentoOrigen    = b.documento_origen ?? (b.modo === 'revision' ? b.cliente_documento ?? null : null);
    this.tipoRegistro       = b.modo === 'ajuste' ? 'venta' : b.tipo_registro ?? 'cotizacion';
    this.motivoAjuste       = b.motivo_ajuste ?? '';
    this.pagadoDeLaVenta    = b.pagado ?? 0;
    if (b.datos_venta) this.datosVenta = { ...datosVentaIniciales(), ...b.datos_venta };

    this.recalcularTodo();
  }

  confirmarLimpiarFormulario() {
    if (this.tieneCliente || this.tieneItemsValidos) {
      this.confirmationSvc.confirm({
        message: this.borradorModo
          ? `Se descarta lo que armaste y ${this.borradorFolioPadre} no cambia.`
          : 'Se borrarán el cliente y los ítems.',
        header: '¿Empezar de nuevo?',
        icon: 'pi pi-refresh',
        acceptLabel: 'Sí, empezar de nuevo',
        rejectLabel: 'Cancelar',
        acceptButtonStyleClass: 'p-button-warning border-round-xl',
        accept: () => this.limpiarFormulario()
      });
    } else {
      this.limpiarFormulario();
    }
  }

  limpiarFormulario() {
    this.resetearFormulario();
    this.cdr.markForCheck();
  }
}
