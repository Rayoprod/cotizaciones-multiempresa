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
import { MessageService, ConfirmationService } from 'primeng/api';
import { SessionContextService } from '../../services/session-context.service';
import { extraerNombreClienteTexto, extraerDocumentoClienteTexto } from '../../models';

@Component({
  selector: 'app-cotizador',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    TableModule, ButtonModule, CardModule,
    InputNumberModule, InputTextModule,
    ToggleButtonModule, SelectButtonModule, AutoCompleteModule,
    DialogModule, DropdownModule, TooltipModule, ToastModule, InputTextareaModule,
    ProgressSpinnerModule, ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './cotizador.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CotizadorComponent implements OnInit {

  // ── Estado de empresa ─────────────────────────────────────────────────────
  empresaActiva: any = null;
  datosActuales: any = null;

  // ── Condiciones PDF ───────────────────────────────────────────────────────
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

  // ── Selector maquinaria ───────────────────────────────────────────────────
  modalMaquinariaVisible = false;
  borradorModo: 'revision' | 'duplicar' | null = null;
  cargando = true;
  generandoPDF = false;
  buscandoDocumento = false;
  borradorFolioPadre: string | null = null;
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
    this.datosActuales = this.empresaActiva;

    const hayBorrador = !!sessionStorage.getItem('cotizador-borrador');

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

    if (this.empresaActiva?.id) {
      await this.cargarDatosDesdeBD();
    }

    this.cargando = false;
    this.cdr.markForCheck();
  }

  // ── Validación ────────────────────────────────────────────────────────────

  get tieneItemsValidos(): boolean {
    return this.carrito.some(
      item => item.descripcion?.trim() && item.precio_unitario !== null && item.precio_unitario !== undefined && Number(item.precio_unitario) >= 0 && Number(item.cantidad) > 0
    );
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

      const [prods, clis, maqRes] = await Promise.all([
        this.supabaseSvc.getProductos(empresaId),
        this.supabaseSvc.getClientes(empresaId),
        this.supabaseSvc.client
          .from('maquinaria')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('activa', true)
          .order('nombre')
      ]);

      this.productosBD = prods || [];
      this.clientesBD = clis || [];
      this.maquinariaBD = maqRes.data || [];
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

  alCambiarDocumentoInput() {
    const doc = this.clienteDocumentoTexto;
    if ((doc.length === 8 || doc.length === 11) && !this.buscandoDocumento && !this.clienteNombre) {
      this.buscarDocumento();
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
      const datosCrudos = await this.apiPeru.buscarDocumento(doc);
      if (!datosCrudos) throw new Error('No encontrado');

      const datos = datosCrudos.data || datosCrudos.result || datosCrudos;
      let nombreFinal = '';

      if (doc.length === 8) {
        nombreFinal = datos.full_name || datos.nombre_completo || '';
        if (!nombreFinal) {
          const nom = datos.first_name || datos.nombres || datos.nombre || '';
          const pat = datos.first_last_name || datos.apellidoPaterno || datos.apellido_paterno || '';
          const mat = datos.second_last_name || datos.apellidoMaterno || datos.apellido_materno || '';
          nombreFinal = `${nom} ${pat} ${mat}`.trim();
        }
      } else {
        nombreFinal = datos.nombre_o_razon_social || datos.razon_social ||
          datos.razonSocial || datos.nombre_comercial || datos.name || '';
      }

      this.clienteNombre = nombreFinal;
      this.clienteDireccion = datos.direccion_completa || datos.direccion || datos.address || '';
      this.clienteTelefono = '';
      this.clienteCorreo = '';

      this.messageService.add({ severity: 'success', summary: 'API', detail: 'Datos obtenidos de SUNAT/RENIEC.' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'No Encontrado', detail: 'El documento no existe.' });
    } finally {
      this.buscandoDocumento = false;
      this.cdr.markForCheck();
    }
  }

  async procesarClienteSilencioso(): Promise<string | null> {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    const nombreTrim = this.clienteNombreTexto;
    const docTrim = this.clienteDocumentoTexto;
    if (!nombreTrim || !docTrim || !empresa?.id) return null;

    let existe = this.clientesBD.find(c => String(c.documento_identidad || '').trim() === docTrim);

    if (!existe) {
      try {
        const clienteGuardado = await this.supabaseSvc.guardarCliente({
          nombre_razon_social: nombreTrim,
          documento_identidad: docTrim,
          telefono: this.clienteTelefono?.trim() || null,
          direccion: this.clienteDireccion?.trim() || null,
          correo: this.clienteCorreo?.trim() || null,
          empresa_id: empresa.id
        });
        if (clienteGuardado) {
          this.clientesBD = [...this.clientesBD, clienteGuardado];
          existe = clienteGuardado;
        }
      } catch (e) {
        console.error('Error guardando cliente silencioso:', e);
      }
    } else {
      let necesitaActualizar = false;
      const datosActualizar: any = {
        id: existe.id,
        empresa_id: empresa.id,
        nombre_razon_social: nombreTrim,
        documento_identidad: docTrim
      };

      if (nombreTrim && existe.nombre_razon_social !== nombreTrim) {
        datosActualizar.nombre_razon_social = nombreTrim;
        necesitaActualizar = true;
      }
      const telTrim = this.clienteTelefono?.trim() || null;
      if (telTrim && telTrim !== (existe.telefono || null)) {
        datosActualizar.telefono = telTrim;
        necesitaActualizar = true;
      }
      const dirTrim = this.clienteDireccion?.trim() || null;
      if (dirTrim && dirTrim !== (existe.direccion || null)) {
        datosActualizar.direccion = dirTrim;
        necesitaActualizar = true;
      }
      const correoTrim = this.clienteCorreo?.trim() || null;
      if (correoTrim && correoTrim !== (existe.correo || null)) {
        datosActualizar.correo = correoTrim;
        necesitaActualizar = true;
      }

      if (necesitaActualizar) {
        try {
          const clienteAct = await this.supabaseSvc.guardarCliente(datosActualizar);
          if (clienteAct) {
            const idx = this.clientesBD.findIndex(c => c.id === existe.id);
            if (idx !== -1) {
              this.clientesBD[idx] = { ...this.clientesBD[idx], ...clienteAct };
            }
          }
        } catch (e) {
          console.error('Error actualizando cliente silencioso:', e);
        }
      }
    }

    return existe ? (existe.id || null) : null;
  }

  async procesarProductosSilenciosos() {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) return;

    const itemsValidos = this.carrito.filter(
      item => item.descripcion?.trim() && Number(item.cantidad) > 0 && item.precio_unitario !== null && item.precio_unitario !== undefined && Number(item.precio_unitario) >= 0
    );

    for (const item of itemsValidos) {
      const descTrim = String(item.descripcion).trim();
      const yaExiste = this.productosBD.some(
        p => p.descripcion?.toLowerCase().trim() === descTrim.toLowerCase()
      );

      if (!yaExiste) {
        try {
          const sku = (item.sku && !item.sku.startsWith('VAR-')) ? item.sku : this.generarSkuAutomaticoCotizador();
          const nuevoProd = await this.supabaseSvc.guardarProducto({
            codigo_sku: sku,
            descripcion: descTrim,
            unidad: item.unidad ? String(item.unidad).trim() : 'und',
            precio_unitario_base: Number(item.precio_unitario) || 0,
            empresa_id: empresa.id
          });
          if (nuevoProd) {
            this.productosBD = [...this.productosBD, nuevoProd];
          }
        } catch (e) {
          console.error('Error guardando producto silencioso:', e);
        }
      }
    }
  }

  generarSkuAutomaticoCotizador(): string {
    const numeros = this.productosBD
      .map(p => p.codigo_sku)
      .filter(Boolean)
      .map(sku => {
        const match = (sku || '').match(/PRD-(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
      });
    const maxNum = numeros.length > 0 ? Math.max(...numeros) : 0;
    let siguiente = maxNum + 1;
    let skuCandidate = `PRD-${siguiente.toString().padStart(4, '0')}`;
    while (this.productosBD.some(p => (p.codigo_sku || '').trim().toLowerCase() === skuCandidate.toLowerCase())) {
      siguiente++;
      skuCandidate = `PRD-${siguiente.toString().padStart(4, '0')}`;
    }
    return skuCandidate;
  }

  // ── Carrito ───────────────────────────────────────────────────────────────

  agregarFila() {
    this.carrito = [...this.carrito, {
      sku: 'VAR-' + Math.floor(1000 + Math.random() * 9000),
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

  validarTexto(item: any) {
    if (item.descripcion?.length > 100) item.descripcion = item.descripcion.substring(0, 100);
  }

  recalcularItem(item: any) {
    if (item.descripcion?.trim()) {
      const prodMatch = this.productosBD.find(
        p => p.descripcion?.toLowerCase().trim() === String(item.descripcion).toLowerCase().trim()
      );
      if (prodMatch) {
        if (!item.sku || item.sku.startsWith('VAR-')) {
          item.sku = prodMatch.codigo_sku;
        }
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
    }
    const qty = Number(item.cantidad) || 0;
    const price = Number(item.precio_unitario) || 0;
    item.subtotal = Math.round(qty * price * 100) / 100;
    this.recalcularTodo();
  }

  recalcularTodo() {
    const rawSubtotal = this.carrito
      .filter(item => item.descripcion?.trim() && Number(item.cantidad) > 0 && item.precio_unitario !== null && item.precio_unitario !== undefined && Number(item.precio_unitario) >= 0)
      .reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
    this.subtotalGeneral = Math.round(rawSubtotal * 100) / 100;
    this.igvTotal = this.incluyeIgv ? Math.round(this.subtotalGeneral * 0.18 * 100) / 100 : 0;
    this.totalFinal = Math.round((this.subtotalGeneral + this.igvTotal) * 100) / 100;
    this.cdr.markForCheck();
  }

  // ── Generar PDF ───────────────────────────────────────────────────────────

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

    this.generandoPDF = true;

    const itemsValidos = this.carrito
      .filter(item => item.descripcion?.trim() && Number(item.cantidad) > 0 && item.precio_unitario !== null && item.precio_unitario !== undefined && Number(item.precio_unitario) >= 0)
      .map(item => ({
        sku: item.sku || 'VAR-' + Math.floor(1000 + Math.random() * 9000),
        descripcion: String(item.descripcion).trim(),
        unidad: item.unidad ? String(item.unidad).trim() : 'und',
        cantidad: Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario),
        subtotal: Math.round(Number(item.cantidad) * Number(item.precio_unitario) * 100) / 100
      }));

    this.messageService.add({
      severity: 'info', summary: 'Procesando', detail: 'Guardando cotización...', life: 2000
    });

    try {
      const empresa = this.empresaActiva || this.session.empresaActiva();
      if (!empresa?.id) {
        this.messageService.add({
          severity: 'error',
          summary: 'Empresa no seleccionada',
          detail: 'Por favor selecciona una empresa activa.'
        });
        this.generandoPDF = false;
        return;
      }
      this.empresaActiva = empresa;

      let clienteId: string | null = null;
      if (navigator.onLine) {
        try {
          clienteId = await this.procesarClienteSilencioso();
          await this.procesarProductosSilenciosos();
        } catch (e) {
          console.warn('Procesamiento silencioso no completado en red:', e);
        }
      }

      let observacionesBD = this.clienteObservaciones?.trim() || '';
      if (this.borradorFolioPadre) {
        const prefijoModo = this.borradorModo === 'revision' ? 'Revisión de' : 'Duplicado de';
        const notaBorrador = `[${prefijoModo} ${this.borradorFolioPadre}]`;
        if (!observacionesBD.includes(notaBorrador)) {
          observacionesBD = observacionesBD ? `${notaBorrador} ${observacionesBD}` : notaBorrador;
        }
      }

      let vendedorEmail = this.session.usuario()?.email ?? null;
      if (!vendedorEmail && navigator.onLine) {
        try {
          const usr = await this.supabaseSvc.obtenerUsuarioActual();
          vendedorEmail = usr?.email ?? null;
        } catch { /* ignore */ }
      }

      const cotizacionBase: any = {
        fecha: new Date().toISOString(),
        empresa_id: empresa.id,
        cliente_id: clienteId,
        cliente_nombre: this.clienteNombreTexto,
        cliente_documento: this.clienteDocumentoTexto,
        cliente_telefono: this.clienteTelefono ? String(this.clienteTelefono).trim() : null,
        cliente_direccion: this.clienteDireccion ? String(this.clienteDireccion).trim() : null,
        cliente_correo: this.clienteCorreo ? String(this.clienteCorreo).trim() : null,
        subtotal: this.subtotalGeneral,
        igv: this.igvTotal,
        total: this.totalFinal,
        estado: 'PENDIENTE',
        items: itemsValidos,
        vendedor: vendedorEmail,
        lugar_entrega: this.lugarEntrega,
        observaciones: observacionesBD || null
      };

      const prefijoFallback = empresa.prefijo || 'COT';
      const folioSeguro = await this.supabaseSvc.obtenerSiguienteFolio(empresa.id, prefijoFallback);

      const cotizacionParaBD = {
        ...cotizacionBase,
        folio: folioSeguro
      };

      await this.supabaseSvc.guardarCotizacion(cotizacionParaBD);

      const cotizacionParaPdf = {
        ...cotizacionParaBD,
        clientenombre: cotizacionParaBD.cliente_nombre,
        clientedocumento: cotizacionParaBD.cliente_documento,
        clientetelefono: cotizacionParaBD.cliente_telefono,
        clientedireccion: cotizacionParaBD.cliente_direccion,
        clientecorreo: cotizacionParaBD.cliente_correo,
        lugarentrega: cotizacionParaBD.lugar_entrega
      };

      try {
        await this.pdfSvc.generarYDescargarCotizacion(
          cotizacionParaPdf,
          this.empresaActiva,
          this.lugarEntrega,
          this.condiciones
        );

        this.messageService.add({
          severity: 'success', summary: '¡Listo!', detail: `Cotización ${folioSeguro} guardada en BD y descargada en tiempo real.`
        });
      } catch (pdfError) {
        console.error('Error al generar PDF:', pdfError);
        this.messageService.add({
          severity: 'warn',
          summary: 'Cotización guardada en BD',
          detail: `La cotización ${folioSeguro} fue registrada en tiempo real, pero ocurrió un detalle al emitir el PDF. Puedes descargarlo desde el Historial.`,
          life: 8000
        });
      }

      this.resetearTrasGuardar();
      this.cdr.markForCheck();

    } catch (error) {
      console.error('Error crítico al procesar cotización:', error);
      this.messageService.add({
        severity: 'error', summary: 'Error', detail: 'Ocurrió un error al procesar la cotización.'
      });
    } finally {
      this.generandoPDF = false;
      this.cdr.markForCheck();
    }
  }

  private resetearTrasGuardar() {
    sessionStorage.removeItem('cotizador-borrador');
    this.clienteNombre        = '';
    this.clienteDocumento     = '';
    this.clienteTelefono      = '';
    this.clienteDireccion     = '';
    this.clienteCorreo        = '';
    this.clienteObservaciones = '';
    this.lugarEntrega         = 'CANTERA';
    this.incluyeIgv           = true;
    this.carrito              = [];
    this.borradorModo         = null;
    this.borradorFolioPadre   = null;
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
      sku: 'MAQ-' + Math.floor(1000 + Math.random() * 9000),
      descripcion,
      unidad: 'und',
      cantidad: this.cantidadMaquina,
      precio_unitario: this.precioMaquinaSeleccionada,
      subtotal: Math.round(this.cantidadMaquina * this.precioMaquinaSeleccionada * 100) / 100
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

  private cargarBorradorSiExiste(): boolean {
    const raw = sessionStorage.getItem('cotizador-borrador');
    if (!raw) return false;

    try {
      const b = JSON.parse(raw);

      this.clienteNombre        = b.cliente_nombre    || '';
      this.clienteDocumento     = b.cliente_documento || '';
      this.clienteTelefono      = b.cliente_telefono  || '';
      this.clienteDireccion     = b.cliente_direccion || '';
      this.clienteCorreo        = b.cliente_correo    || '';
      this.clienteObservaciones = b.observaciones     || '';
      this.lugarEntrega         = b.lugar_entrega     || 'CANTERA';
      if (b.incluye_igv !== undefined) {
        this.incluyeIgv         = b.incluye_igv;
      }

      if (b.items?.length > 0) {
        this.carrito = b.items.map((item: any) => ({
          sku:             item.sku             || 'VAR-' + Math.floor(1000 + Math.random() * 9000),
          descripcion:     item.descripcion     || '',
          unidad:          item.unidad          || '',
          cantidad:        item.cantidad        ?? null,
          precio_unitario: item.precio_unitario ?? null,
          subtotal:        Math.round((item.cantidad || 0) * (item.precio_unitario || 0) * 100) / 100
        }));
      }

      this.borradorModo       = b.modo       || null;
      this.borradorFolioPadre = b.folio_padre || null;

      this.recalcularTodo();

      sessionStorage.removeItem('cotizador-borrador');

      this.messageService.add({
        severity: b.modo === 'revision' ? 'warn' : 'info',
        summary: b.modo === 'revision'
          ? `✏️ Revisión de ${b.folio_padre}`
          : '📋 Cotización duplicada',
        detail: b.modo === 'revision'
          ? 'La cotización original fue marcada como Anulada.'
          : 'Datos cargados. Se generará un folio nuevo al guardar.',
        life: 6000
      });
      return true;
    } catch (e) {
      sessionStorage.removeItem('cotizador-borrador');
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
    sessionStorage.removeItem('cotizador-borrador');
    this.clienteNombre        = '';
    this.clienteDocumento     = '';
    this.clienteTelefono      = '';
    this.clienteDireccion     = '';
    this.clienteCorreo        = '';
    this.clienteObservaciones = '';
    this.lugarEntrega         = 'CANTERA';
    this.incluyeIgv           = true;
    this.carrito              = [];
    this.borradorModo         = null;
    this.borradorFolioPadre   = null;
    this.agregarFila();
    this.recalcularTodo();

    this.messageService.add({
      severity: 'info',
      summary: 'Formulario limpiado',
      detail: 'Todos los campos restablecidos',
      life: 3000
    });
  }

  cambiarEmpresaConDatos() {
    if (this.clienteNombre || this.tieneItemsValidos) {
      const borrador = {
        modo:              'duplicar',
        cliente_nombre:    this.clienteNombre,
        cliente_documento: this.clienteDocumento,
        cliente_telefono:  this.clienteTelefono,
        cliente_direccion: this.clienteDireccion,
        cliente_correo:    this.clienteCorreo,
        observaciones:     this.clienteObservaciones,
        lugar_entrega:     this.lugarEntrega,
        incluye_igv:        this.incluyeIgv,
        items:             this.carrito
      };
      sessionStorage.setItem('cotizador-borrador', JSON.stringify(borrador));  // ← clave correcta
    }
    this.router.navigate(['/selector']);
  }
}