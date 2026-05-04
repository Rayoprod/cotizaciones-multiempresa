import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';

import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';
import { ApiPeruService } from '../../services/api-peru.service';
import { ICotizacion } from '../../models/cotizacion.model';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectButtonModule } from 'primeng/selectbutton';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-cotizador',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    TableModule, ButtonModule, CardModule,
    InputNumberModule, InputTextModule, TextareaModule,
    ToggleSwitchModule, SelectButtonModule, AutoCompleteModule,
    TooltipModule, ToastModule
  ],
  providers: [MessageService],
  templateUrl: './cotizador.html'
})
export class CotizadorComponent implements OnInit {

  // ── Estado de empresa ─────────────────────────────────────────────────────
  empresaActiva: any = null;
  datosActuales: any = null;

  // ── Condiciones PDF ───────────────────────────────────────────────────────
  condiciones = {
    mostrarValidez:       true,
    diasValidez:          '15',
    mostrarCuentas:       true,
    mostrarContacto:      false,
    mostrarObservaciones: false
  };

  // ── Datos BD ──────────────────────────────────────────────────────────────
  productosBD:               any[]    = [];
  clientesBD:                any[]    = [];
  nombresClientesFiltrados:  any[]    = [];
  nombresProductosFiltrados: string[] = [];

  // ── Carrito ───────────────────────────────────────────────────────────────
  carrito: any[] = [];

  // ── Formulario cliente ────────────────────────────────────────────────────
  clienteNombre:        string = '';
  clienteDocumento:     string = '';
  clienteTelefono:      string = '';
  clienteDireccion:     string = '';
  clienteCorreo:        string = '';
  clienteObservaciones: string = '';

  // ── Opciones ──────────────────────────────────────────────────────────────
  incluyeIgv:   boolean = true;
  lugarEntrega: string  = 'CANTERA';

  opcionesLugar = [
    { label: 'En Cantera', value: 'CANTERA' },
    { label: 'En Obra',    value: 'OBRA'    }
  ];

  // ── Totales ───────────────────────────────────────────────────────────────
  subtotalGeneral: number = 0;
  igvTotal:        number = 0;
  totalFinal:      number = 0;

  constructor(
    private cdr:            ChangeDetectorRef,
    private supabaseSvc:    SupabaseService,
    private pdfSvc:         PdfService,
    private router:         Router,
    private messageService: MessageService,
    private apiPeru:        ApiPeruService
  ) {}

  // ── Init ──────────────────────────────────────────────────────────────────

  async ngOnInit() {
    this.agregarFila();

    const datos = sessionStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : null;
    this.datosActuales = this.empresaActiva;

    // FIX: se setea DESPUÉS de tener empresaActiva
    this.condiciones.mostrarCuentas  = this.empresaActiva?.mostrar_cuentas ?? true;
    this.condiciones.mostrarContacto = !(this.empresaActiva?.mostrar_cuentas ?? true);

    if (!this.empresaActiva?.id) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Empresa no seleccionada',
        detail: 'Debes seleccionar una empresa antes de cotizar.'
      });
      this.router.navigate(['/selector']);
      return;
    }

    await this.cargarDatosDesdeBD();
  }

  // ── Validación ────────────────────────────────────────────────────────────

  tieneItemsValidos(): boolean {
    return this.carrito.some(
      item => item.descripcion && item.precio_unitario > 0 && item.cantidad > 0
    );
  }

  puedeGenerar(): boolean {
    return !!this.clienteNombre &&
           !!this.clienteDocumento &&
           this.tieneItemsValidos();
  }

  // ── Carga inicial ─────────────────────────────────────────────────────────

  async cargarDatosDesdeBD() {
    try {
      const empresaId = this.empresaActiva?.id;
      if (!empresaId) return;
      this.productosBD = await this.supabaseSvc.getProductos(empresaId);
      this.clientesBD  = await this.supabaseSvc.getClientes(empresaId);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Error cargando datos:', e);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudieron cargar productos o clientes.'
      });
    }
  }

  // ── Clientes ──────────────────────────────────────────────────────────────

  filtrarNombresClientes(event: any) {
    const query = (event.query || '').toLowerCase();
    this.nombresClientesFiltrados = this.clientesBD
      .filter(c =>
        (c.nombre_razon_social?.toLowerCase().includes(query)) ||
        (String(c.documento_identidad || '').includes(query))
      )
      .map(c => c.nombre_razon_social);
  }

  alElegirNombreSugerido(event: any) {
    const nombreElegido = event.value || event;
    const cliente = this.clientesBD.find(c => c.nombre_razon_social === nombreElegido);
    if (cliente) {
      this.clienteNombre    = cliente.nombre_razon_social;
      this.clienteDocumento = cliente.documento_identidad || '';
      this.clienteTelefono  = cliente.telefono  || '';
      this.clienteDireccion = cliente.direccion || '';
      this.clienteCorreo    = cliente.correo    || '';
      this.cdr.detectChanges();
    }
  }

  async buscarDocumento() {
    const doc = String(this.clienteDocumento || '').trim();

    if (!doc) {
      this.messageService.add({ severity: 'warn', summary: 'Atención', detail: 'Escribe un DNI o RUC' });
      return;
    }

    const clienteExistente = this.clientesBD.find(
      c => String(c.documento_identidad) === doc
    );

    if (clienteExistente) {
      this.clienteNombre    = clienteExistente.nombre_razon_social || '';
      this.clienteDireccion = clienteExistente.direccion || '';
      this.clienteTelefono  = clienteExistente.telefono  || '';
      this.clienteCorreo    = clienteExistente.correo    || '';
      this.messageService.add({ severity: 'success', summary: 'Local', detail: 'Datos obtenidos de tu Base de Datos.' });
      this.cdr.detectChanges();
      return;
    }

    if (doc.length !== 8 && doc.length !== 11) {
      this.messageService.add({ severity: 'warn', summary: 'Error', detail: 'DNI (8) o RUC (11) inválido.' });
      return;
    }

    this.messageService.add({ severity: 'info', summary: 'Consultando', detail: 'Buscando en SUNAT/RENIEC...' });

    try {
      const token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd';
      const tipo  = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';

      const respuesta   = await fetch(`/api-peru/v1/${tipo}?numero=${doc}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const datosCrudos = await respuesta.json();

      if (!respuesta.ok || !datosCrudos) throw new Error('No encontrado');

      const datos = datosCrudos.data || datosCrudos.result || datosCrudos;
      let nombreFinal = '';

      if (doc.length === 8) {
        nombreFinal = datos.full_name || datos.nombre_completo || '';
        if (!nombreFinal) {
          const nom = datos.first_name        || datos.nombres          || datos.nombre           || '';
          const pat = datos.first_last_name   || datos.apellidoPaterno  || datos.apellido_paterno || '';
          const mat = datos.second_last_name  || datos.apellidoMaterno  || datos.apellido_materno || '';
          nombreFinal = `${nom} ${pat} ${mat}`.trim();
        }
      } else {
        nombreFinal = datos.nombre_o_razon_social || datos.razon_social ||
                      datos.razonSocial || datos.nombre_comercial || datos.name || '';
      }

      this.clienteNombre    = nombreFinal;
      this.clienteDireccion = datos.direccion_completa || datos.direccion || datos.address || '';
      this.clienteTelefono  = '';
      this.clienteCorreo    = '';
      this.cdr.detectChanges();

      this.messageService.add({ severity: 'success', summary: 'API', detail: 'Datos obtenidos de SUNAT/RENIEC.' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'No Encontrado', detail: 'El documento no existe.' });
    }
  }

  async procesarClienteSilencioso() {
    if (!this.clienteNombre || !this.clienteDocumento || !this.empresaActiva?.id) return;

    const existe = this.clientesBD.find(c => c.documento_identidad === this.clienteDocumento);
    if (!existe) {
      try {
        await this.supabaseSvc.guardarCliente({
          nombre_razon_social: this.clienteNombre,
          documento_identidad: this.clienteDocumento,
          telefono:   this.clienteTelefono  || null,
          direccion:  this.clienteDireccion || null,
          correo:     this.clienteCorreo    || null,
          empresa_id: this.empresaActiva.id
        });
        this.clientesBD = await this.supabaseSvc.getClientes(this.empresaActiva.id);
      } catch (e) {
        console.error('Error guardando cliente silencioso:', e);
      }
    }
  }

  // ── Carrito ───────────────────────────────────────────────────────────────

  agregarFila() {
    this.carrito = [...this.carrito, {
      sku:             'VAR-' + Math.floor(1000 + Math.random() * 9000),
      descripcion:     '',
      unidad:          '',
      cantidad:        null,
      precio_unitario: null,
      subtotal:        0
    }];
  }

  eliminarItem(index: number) {
    this.carrito = this.carrito.filter((_, i) => i !== index);
    this.recalcularTodo();
  }

  filtrarNombresProductos(event: any) {
    const query = (event.query || '').toLowerCase();
    this.nombresProductosFiltrados = this.productosBD
      .filter(p => p.descripcion.toLowerCase().includes(query))
      .map(p => p.descripcion);
  }

  alElegirProductoSugerido(event: any, item: any) {
    const producto = this.productosBD.find(p => p.descripcion === (event.value || event));
    if (producto) {
      item.sku             = producto.codigo_sku;
      item.descripcion     = producto.descripcion;
      item.unidad          = producto.unidad;
      item.precio_unitario = producto.precio_unitario_base;
      item.cantidad        = null;
      this.recalcularItem(item);
    }
  }

  validarTexto(item: any) {
    if (item.descripcion?.length > 100) item.descripcion = item.descripcion.substring(0, 100);
  }

  recalcularItem(item: any) {
    item.subtotal = (item.cantidad || 0) * (item.precio_unitario || 0);
    this.recalcularTodo();
  }

  recalcularTodo() {
    this.subtotalGeneral = this.carrito.reduce((acc, item) => acc + Number(item.subtotal), 0);
    this.igvTotal        = this.incluyeIgv ? this.subtotalGeneral * 0.18 : 0;
    this.totalFinal      = this.subtotalGeneral + this.igvTotal;
    this.cdr.detectChanges();
  }

  // ── Generar PDF ───────────────────────────────────────────────────────────

  async generarPDF() {
    const itemsValidos = this.carrito.filter(
      item => item.descripcion && item.precio_unitario > 0 && item.cantidad > 0
    );
    if (!itemsValidos.length || !this.empresaActiva?.id) return;

    this.messageService.add({
      severity: 'info', summary: 'Procesando', detail: 'Generando cotización...', life: 2000
    });

    try {
      await this.procesarClienteSilencioso();

      const folioSeguro = await this.supabaseSvc.obtenerSiguienteFolio(this.empresaActiva.id);

      const cotizacionParaBD: ICotizacion = {
        folio:             folioSeguro,
        fecha:             new Date().toISOString(),
        empresa_id:        this.empresaActiva.id,
        cliente_nombre:    this.clienteNombre,
        cliente_documento: this.clienteDocumento,
        cliente_telefono:  this.clienteTelefono,
        cliente_direccion: this.clienteDireccion,
        cliente_correo:    this.clienteCorreo,
        subtotal:          this.subtotalGeneral,
        igv:               this.igvTotal,
        total:             this.totalFinal,
        estado:            'PENDIENTE',
        items:             itemsValidos,
        vendedor:          sessionStorage.getItem('usuario_email') ?? '',  // FIX: sin session
        lugar_entrega:     this.lugarEntrega,
        observaciones:     this.clienteObservaciones
      };

      await this.supabaseSvc.guardarCotizacion(cotizacionParaBD);
      await this.pdfSvc.generarYDescargarCotizacion(
        cotizacionParaBD,
        this.empresaActiva,
        this.lugarEntrega,
        this.condiciones
      );

      this.messageService.add({
        severity: 'success', summary: '¡Listo!', detail: 'Cotización generada con éxito.'
      });
    } catch (error) {
      console.error('Error al generar:', error);
      this.messageService.add({
        severity: 'error', summary: 'Error', detail: 'No se pudo generar la cotización.'
      });
    }
  }
}