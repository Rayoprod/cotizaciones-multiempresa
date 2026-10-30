import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';
import { ApiPeruService } from '../../services/api-peru.service';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';

import { ToggleButtonModule } from 'primeng/togglebutton';
import { SelectButtonModule } from 'primeng/selectbutton';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SessionContextService } from '../../services/session-context.service';
import {
  extraerNombreClienteTexto, extraerDocumentoClienteTexto,
  calcularTotales, redondear2, CLAVE_BORRADOR_COTIZADOR,
  IBorradorCotizador, INuevaCotizacion
} from '../../models';

@Component({
  selector: 'app-cotizador',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    TableModule, ButtonModule, CardModule,
    InputNumberModule, InputTextModule,
    ToggleButtonModule, SelectButtonModule, AutoCompleteModule,
    DialogModule, DropdownModule, TooltipModule, ToastModule, InputTextareaModule,
    ProgressSpinnerModule, ConfirmDialogModule, CheckboxModule
  ],
  templateUrl: './cotizador.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CotizadorComponent implements OnInit {

  // ── Estado de empresa ─────────────────────────────────────────────────────
  empresaActiva: any = null;

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

  // ── Datos BD ──────────────────────────────────────────────────────────────
  productosBD: any[] = [];
  maquinariaBD: any[] = [];
  clientesBD: any[] = [];
  nombresClientesFiltrados: any[] = [];
  nombresProductosFiltrados: string[] = [];

  // ── Carrito ───────────────────────────────────────────────────────────────
  carrito: any[] = [];

  // ── Formulario cliente ────────────────────────────────────────────────────
  clienteNombre: string = '';
  clienteDocumento: string = '';
  clienteTelefono: string = '';
  clienteDireccion: string = '';
  clienteCorreo: string = '';
  clienteObservaciones: string = '';
  guardarClienteEnCartera = true;

  // ── Opciones ──────────────────────────────────────────────────────────────
  incluyeIgv: boolean = true;
  lugarEntrega: string = 'CANTERA';

  opcionesLugar = [
    { label: 'En Cantera', value: 'CANTERA' },
    { label: 'En Obra', value: 'OBRA' }
  ];

  // ── Totales ───────────────────────────────────────────────────────────────
  subtotalGeneral: number = 0;
  igvTotal: number = 0;
  totalFinal: number = 0;

  // ── Revisión / duplicado abierto desde el historial ──────────────────────
  borradorModo: 'revision' | 'duplicar' | null = null;
  borradorOrigenId: string | null = null;
  borradorFolioPadre: string | null = null;

  // ── Selector maquinaria ───────────────────────────────────────────────────
  modalMaquinariaVisible = false;
  cargando = true;
  generandoPDF = false;
  buscandoDocumento = false;
  maquinaSeleccionada: any = null;
  modalidadMaquina: string = 'alquiler_dia';
  cantidadMaquina: number = 1;

  opcionesModalidad = [
    { label: 'Alquiler por hora', value: 'alquiler_hora' },
    { label: 'Alquiler por día', value: 'alquiler_dia' },
    { label: 'Alquiler por mes', value: 'alquiler_mes' },
    { label: 'Venta', value: 'venta' }
  ];

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
      this.messageService.add({
        severity: 'warn', summary: 'Empresa no seleccionada',
        detail: 'Debes seleccionar una empresa antes de cotizar.'
      });
      this.router.navigate(['/selector']);
      return;
    }

    this.condiciones.mostrarCuentas = this.empresaActiva?.mostrar_cuentas ?? true;
    this.condiciones.mostrarContacto = !(this.empresaActiva?.mostrar_cuentas ?? true);

    const borradorCargado = this.cargarBorradorSiExiste();
    if (!borradorCargado && this.carrito.length === 0) {
      this.agregarFila();
    }

    await this.cargarDatosDesdeBD();

    this.cargando = false;
    this.cdr.markForCheck();
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
    return !!this.clienteNombreTexto &&
      !!this.clienteDocumentoTexto &&
      this.tieneItemsValidos &&
      !!empresa?.id;
  }

  // ── Carga inicial ─────────────────────────────────────────────────────────

  async cargarDatosDesdeBD() {
    try {
      const empresaId = this.empresaActiva?.id;
      if (!empresaId) return;

      const [prods, clis, maqs] = await Promise.all([
        this.supabaseSvc.getProductos(empresaId),
        this.supabaseSvc.getClientes(empresaId),
        this.supabaseSvc.getMaquinaria(empresaId, true)
      ]);

      this.productosBD = prods || [];
      this.clientesBD = clis || [];
      this.maquinariaBD = maqs || [];
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

  // ── Clientes ──────────────────────────────────────────────────────────────

  obtenerNombreClienteTexto(val: any): string {
    return extraerNombreClienteTexto(val);
  }

  get clienteNombreTexto(): string {
    return this.obtenerNombreClienteTexto(this.clienteNombre);
  }

  get clienteDocumentoTexto(): string {
    return extraerDocumentoClienteTexto(this.clienteDocumento);
  }

  get clienteYaRegistrado(): boolean {
    const doc = this.clienteDocumentoTexto;
    return !!doc && this.clientesBD.some(c => String(c.documento_identidad || '').trim() === doc);
  }

  filtrarNombresClientes(event: any) {
    const query = (event.query || '').toLowerCase();
    const nombres = this.clientesBD
      .filter(c =>
        (c.nombre_razon_social?.toLowerCase().includes(query)) ||
        (String(c.documento_identidad || '').includes(query))
      )
      .map(c => c.nombre_razon_social)
      .filter(Boolean);
    this.nombresClientesFiltrados = Array.from(new Set(nombres));
    this.cdr.markForCheck();
  }

  alElegirNombreSugerido(event: any) {
    const nombreElegido = this.obtenerNombreClienteTexto(event);
    const target = nombreElegido.toLowerCase().trim();
    if (!target) return;

    const cliente = this.clientesBD.find(
      c => c.nombre_razon_social?.toLowerCase().trim() === target ||
           String(c.documento_identidad || '').trim() === target
    );
    if (cliente) {
      this.clienteNombre = cliente.nombre_razon_social;
      this.clienteDocumento = cliente.documento_identidad || '';
      this.clienteTelefono = cliente.telefono || '';
      this.clienteDireccion = cliente.direccion || '';
      this.clienteCorreo = cliente.correo || '';
    } else {
      this.clienteNombre = nombreElegido;
    }
    this.cdr.markForCheck();
  }

  // Al escribir solo se busca en los clientes ya guardados (no gasta consultas).
  // SUNAT/RENIEC se consulta únicamente con el botón o Enter.
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

  async buscarDocumento() {
    if (this.buscandoDocumento) return;

    const doc = this.clienteDocumentoTexto;

    if (!doc) {
      this.messageService.add({ severity: 'warn', summary: 'Atención', detail: 'Escribe un DNI o RUC' });
      return;
    }

    const clienteExistente = this.clientesBD.find(
      c => String(c.documento_identidad || '').trim() === doc
    );

    if (clienteExistente) {
      this.clienteNombre = clienteExistente.nombre_razon_social || '';
      this.clienteDireccion = clienteExistente.direccion || '';
      this.clienteTelefono = clienteExistente.telefono || '';
      this.clienteCorreo = clienteExistente.correo || '';
      this.messageService.add({ severity: 'success', summary: 'Local', detail: 'Datos obtenidos de tu Base de Datos.' });
      this.cdr.markForCheck();
      return;
    }

    if (doc.length !== 8 && doc.length !== 11) {
      this.messageService.add({ severity: 'warn', summary: 'Error', detail: 'DNI (8) o RUC (11) inválido.' });
      return;
    }

    this.buscandoDocumento = true;
    this.cdr.markForCheck();
    this.messageService.add({ severity: 'info', summary: 'Consultando', detail: 'Buscando en SUNAT/RENIEC...' });

    try {
      const datos = await this.apiPeru.buscarDocumento(doc);

      this.clienteNombre = datos.nombre;
      this.clienteDireccion = datos.direccion;
      this.clienteTelefono = '';
      this.clienteCorreo = '';

      this.messageService.add({ severity: 'success', summary: 'API', detail: 'Datos obtenidos de SUNAT/RENIEC.' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'No encontrado', detail: e?.message || 'No se pudo consultar el documento.' });
    } finally {
      this.buscandoDocumento = false;
      this.cdr.markForCheck();
    }
  }

  // ── Carrito ───────────────────────────────────────────────────────────────
  // `sku` solo se llena cuando la línea corresponde a un producto del
  // catálogo o a un equipo con código; las líneas libres no llevan código.

  agregarFila() {
    this.carrito = [...this.carrito, {
      sku: null,
      descripcion: '',
      unidad: '',
      cantidad: null,
      precio_unitario: null,
      subtotal: 0
    }];
  }

  eliminarItem(index: number) {
    this.carrito = this.carrito.filter((_, i) => i !== index);
    this.recalcularTodo();
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
      item.unidad = producto.unidad;
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

    item.sku = prodMatch?.codigo_sku ?? null;
    if (prodMatch) {
      if (!item.unidad) {
        item.unidad = prodMatch.unidad || item.unidad;
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
    const totales = calcularTotales(this.carrito.filter(item => this.esItemValido(item)), this.incluyeIgv);
    this.subtotalGeneral = totales.subtotal;
    this.igvTotal = totales.igv;
    this.totalFinal = totales.total;
    this.cdr.markForCheck();
  }

  // ── Guardar y generar PDF ─────────────────────────────────────────────────

  async generarPDF() {
    if (!this.puedeGenerar || this.generandoPDF) {
      if (!this.puedeGenerar) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Formulario incompleto',
          detail: 'Completa el nombre y documento del cliente e ingresa al menos un ítem válido.'
        });
      }
      return;
    }

    const diasValidez = Number(this.condiciones.diasValidez);
    if (this.condiciones.mostrarValidez && !(Number.isInteger(diasValidez) && diasValidez >= 1 && diasValidez <= 365)) {
      this.messageService.add({
        severity: 'warn', summary: 'Validez inválida', detail: 'La validez de la oferta debe ser un número de días entre 1 y 365.'
      });
      return;
    }

    if (!navigator.onLine) {
      this.messageService.add({
        severity: 'error', summary: 'Sin conexión', detail: 'Conéctate a internet para guardar la cotización.'
      });
      return;
    }

    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) {
      this.messageService.add({
        severity: 'error', summary: 'Empresa no seleccionada', detail: 'Por favor selecciona una empresa activa.'
      });
      return;
    }
    this.empresaActiva = empresa;

    const nueva: INuevaCotizacion = {
      empresaId: empresa.id,
      cliente: {
        nombre: this.clienteNombreTexto,
        documento: this.clienteDocumentoTexto,
        telefono: this.clienteTelefono?.trim() || null,
        direccion: this.clienteDireccion?.trim() || null,
        correo: this.clienteCorreo?.trim() || null
      },
      items: this.carrito
        .filter(item => this.esItemValido(item))
        .map(item => ({
          sku: item.sku || null,
          descripcion: String(item.descripcion).trim(),
          unidad: item.unidad ? String(item.unidad).trim() : null,
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario)
        })),
      incluyeIgv: this.incluyeIgv,
      lugarEntrega: this.lugarEntrega,
      observaciones: this.condiciones.mostrarObservaciones ? (this.clienteObservaciones?.trim() || null) : null,
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

    this.generandoPDF = true;
    this.cdr.markForCheck();

    let guardada;
    try {
      guardada = await this.supabaseSvc.crearCotizacion(nueva);
    } catch (error: any) {
      console.error('Error al guardar la cotización:', error);
      // Los errores de validación de crear_cotizacion() ya vienen en español.
      const esDelServidor = ['22023', 'P0001', '42501'].includes(error?.code) && error?.message;
      this.messageService.add({
        severity: 'error',
        summary: 'No se guardó la cotización',
        detail: esDelServidor ? error.message : 'Revisa tu conexión e inténtalo de nuevo. No se generó ningún folio.',
        life: 8000
      });
      this.generandoPDF = false;
      this.cdr.markForCheck();
      return;
    }

    try {
      await this.pdfSvc.generarYDescargarCotizacion(guardada, this.empresaActiva);
      this.messageService.add({
        severity: 'success', summary: '¡Listo!', detail: `Cotización ${guardada.folio} guardada y descargada.`
      });
    } catch (pdfError) {
      console.error('Error al generar PDF:', pdfError);
      this.messageService.add({
        severity: 'warn',
        summary: 'Cotización guardada',
        detail: `La cotización ${guardada.folio} quedó registrada, pero no se pudo generar el PDF. Descárgalo desde el Historial.`,
        life: 8000
      });
    }

    if (nueva.guardarCliente) {
      this.supabaseSvc.getClientes(empresa.id)
        .then(clientes => { this.clientesBD = clientes || []; })
        .catch(() => { /* la lista se recarga al volver a entrar */ });
    }

    this.resetearFormulario();
    this.generandoPDF = false;
    this.cdr.markForCheck();
  }

  private resetearFormulario() {
    sessionStorage.removeItem(CLAVE_BORRADOR_COTIZADOR);
    this.clienteNombre           = '';
    this.clienteDocumento        = '';
    this.clienteTelefono         = '';
    this.clienteDireccion        = '';
    this.clienteCorreo           = '';
    this.clienteObservaciones    = '';
    this.guardarClienteEnCartera = true;
    this.lugarEntrega            = 'CANTERA';
    this.incluyeIgv              = true;
    this.carrito                 = [];
    this.borradorModo            = null;
    this.borradorOrigenId        = null;
    this.borradorFolioPadre      = null;
    this.agregarFila();
    this.recalcularTodo();
  }

  // ── Maquinaria ────────────────────────────────────────────────────────────

  abrirSelectorMaquinaria() {
    this.maquinaSeleccionada = null;
    this.modalidadMaquina = 'alquiler_dia';
    this.cantidadMaquina = 1;
    this.modalMaquinariaVisible = true;
    this.cdr.markForCheck();
  }

  cerrarSelectorMaquinaria() {
    this.modalMaquinariaVisible = false;
    this.maquinaSeleccionada = null;
    this.modalidadMaquina = 'alquiler_dia';
    this.cantidadMaquina = 1;
    this.cdr.markForCheck();
  }

  get precioMaquinaSeleccionada(): number {
    if (!this.maquinaSeleccionada) return 0;
    switch (this.modalidadMaquina) {
      case 'alquiler_hora': return this.maquinaSeleccionada.precio_hora || 0;
      case 'alquiler_dia': return this.maquinaSeleccionada.precio_dia || 0;
      case 'alquiler_mes': return this.maquinaSeleccionada.precio_mes || 0;
      case 'venta': return this.maquinaSeleccionada.precio_venta || 0;
      default: return 0;
    }
  }

  get labelModalidadSeleccionada(): string {
    const opt = this.opcionesModalidad.find(o => o.value === this.modalidadMaquina);
    return opt?.label || '';
  }

  agregarMaquinariaAlCarrito() {
    if (!this.maquinaSeleccionada || this.precioMaquinaSeleccionada <= 0) {
      this.messageService.add({ severity: 'warn', summary: 'Selecciona una máquina', detail: 'Elige un equipo con precio definido' });
      return;
    }
    const m = this.maquinaSeleccionada;
    const descripcion = `${this.labelModalidadSeleccionada}: ${m.nombre}${m.marca ? ' ' + m.marca : ''}${m.modelo ? ' ' + m.modelo : ''}`.substring(0, 100);
    const itemMaquinaria = {
      sku: m.codigo || null,
      descripcion,
      unidad: 'und',
      cantidad: this.cantidadMaquina,
      precio_unitario: this.precioMaquinaSeleccionada,
      subtotal: redondear2(this.cantidadMaquina * this.precioMaquinaSeleccionada)
    };

    const esUnicoItemVacio = this.carrito.length === 1 &&
      !this.carrito[0].descripcion?.trim() &&
      !this.carrito[0].cantidad &&
      !this.carrito[0].precio_unitario;

    if (esUnicoItemVacio) {
      this.carrito = [itemMaquinaria];
    } else {
      this.carrito = [...this.carrito, itemMaquinaria];
    }
    this.modalMaquinariaVisible = false;
    this.recalcularTodo();
    this.messageService.add({ severity: 'success', summary: 'Agregado', detail: descripcion });
  }

  // ── Borrador desde el historial ───────────────────────────────────────────

  private cargarBorradorSiExiste(): boolean {
    const raw = sessionStorage.getItem(CLAVE_BORRADOR_COTIZADOR);
    if (!raw) return false;
    sessionStorage.removeItem(CLAVE_BORRADOR_COTIZADOR);

    try {
      // Las claves folio_padre / cotizacion_id son de la versión anterior.
      const b: IBorradorCotizador & { folio_padre?: string; cotizacion_id?: string } = JSON.parse(raw);

      this.clienteNombre        = b.cliente_nombre    || '';
      this.clienteDocumento     = b.cliente_documento || '';
      this.clienteTelefono      = b.cliente_telefono  || '';
      this.clienteDireccion     = b.cliente_direccion || '';
      this.clienteCorreo        = b.cliente_correo    || '';
      // Las cotizaciones viejas guardaban "[Revisión de X]" en observaciones.
      this.clienteObservaciones = (b.observaciones || '').replace(/^\[(Revisión|Duplicado) de [^\]]+\]\s*/, '');
      this.condiciones.mostrarObservaciones = !!this.clienteObservaciones;
      this.lugarEntrega         = b.lugar_entrega     || 'CANTERA';
      if (b.incluye_igv !== undefined) {
        this.incluyeIgv         = b.incluye_igv;
      }
      if (b.condiciones && Object.keys(b.condiciones).length > 0) {
        const { diasValidez, ...resto } = b.condiciones;
        Object.assign(this.condiciones, resto);
        if (diasValidez) this.condiciones.diasValidez = String(diasValidez);
      }

      if (b.items?.length > 0) {
        this.carrito = b.items.map(item => ({
          // Los códigos VAR-/MAQ- eran aleatorios, no de un producto real.
          sku:             item.sku && !/^(VAR|MAQ)-/.test(item.sku) ? item.sku : null,
          descripcion:     item.descripcion     || '',
          unidad:          item.unidad          || '',
          cantidad:        item.cantidad        ?? null,
          precio_unitario: item.precio_unitario ?? null,
          subtotal:        redondear2((item.cantidad || 0) * (item.precio_unitario || 0))
        }));
      }

      this.borradorModo       = b.modo || null;
      this.borradorOrigenId   = b.origen_id ?? b.cotizacion_id ?? null;
      this.borradorFolioPadre = b.folio_origen ?? b.folio_padre ?? null;

      this.recalcularTodo();

      this.messageService.add({
        severity: b.modo === 'revision' ? 'warn' : 'info',
        summary:  b.modo === 'revision' ? `Revisando ${this.borradorFolioPadre}` : 'Cotización duplicada',
        detail:   b.modo === 'revision'
          ? 'La original se anulará cuando guardes esta revisión.'
          : `Datos cargados desde ${this.borradorFolioPadre || 'borrador'}.`
      });
      return true;
    } catch (e) {
      console.error('Error al cargar borrador:', e);
      return false;
    }
  }

  confirmarLimpiarFormulario() {
    if (this.clienteNombre || this.tieneItemsValidos) {
      this.confirmationSvc.confirm({
        message: '¿Deseas restablecer la cotización actual? Se borrarán los datos e ítems ingresados.',
        header: 'Limpiar Formulario',
        icon: 'pi pi-refresh',
        acceptLabel: 'Sí, limpiar',
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
    this.messageService.add({
      severity: 'info',
      summary: 'Formulario limpiado',
      detail: 'Todos los campos restablecidos',
      life: 3000
    });
  }
}
