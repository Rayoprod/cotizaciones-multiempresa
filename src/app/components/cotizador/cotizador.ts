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
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-cotizador',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, TableModule, 
    ButtonModule, CardModule, InputNumberModule, InputTextModule, 
    TextareaModule, ToggleSwitchModule, AutoCompleteModule, TooltipModule, ToastModule
  ],
  providers: [MessageService],
  templateUrl: './cotizador.html'
})
export class CotizadorComponent implements OnInit {
  
  empresaActiva: any;
  datosActuales: any;
  
  productosBD: any[] = [];
  clientesBD: any[] = [];
  nombresClientesFiltrados: any[] = [];
  nombresProductosFiltrados: string[] = [];
  
  carrito: any[] = [];
  
  clienteNombre: string = ''; 
  clienteDocumento: string = '';
  clienteTelefono: string = '';
  clienteDireccion: string = '';
  clienteCorreo: string = '';
  clienteObservaciones: string = '';
  
  incluyeIgv: boolean = true;
  lugarEntrega: string = 'CANTERA';

  subtotalGeneral: number = 0;
  igvTotal: number = 0;
  totalFinal: number = 0;

  constructor(
    private cdr: ChangeDetectorRef,
    private supabaseSvc: SupabaseService,
    private pdfSvc: PdfService,
    private router: Router,
    private messageService: MessageService,
    private apiPeru: ApiPeruService 
  ) {}

  async ngOnInit() {
    this.agregarFila();

    // Cargamos directamente TODA la info de la empresa desde la memoria
    const datos = localStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : null;
    this.datosActuales = this.empresaActiva; // Unificamos variables para el HTML

    await this.cargarDatosDesdeBD();
  }

  async cargarDatosDesdeBD() {
    try {
      this.productosBD = await this.supabaseSvc.getProductos();
      this.clientesBD = await this.supabaseSvc.getClientes();
      this.cdr.detectChanges();
    } catch (e) {}
  }

  filtrarNombresClientes(event: any) {
    const query = event.query.toLowerCase();
    this.nombresClientesFiltrados = this.clientesBD
      .filter(c => (c.nombre_razon_social && c.nombre_razon_social.toLowerCase().includes(query)) || 
                   (c.documento_identidad && String(c.documento_identidad).includes(query)))
      .map(c => c.nombre_razon_social); 
  }

  alElegirNombreSugerido(event: any) {
    const nombreElegido = event.value || event;
    const cliente = this.clientesBD.find(c => c.nombre_razon_social === nombreElegido);
    
    if (cliente) {
      this.clienteNombre = cliente.nombre_razon_social;
      this.clienteDocumento = cliente.documento_identidad || '';
      this.clienteTelefono = cliente.telefono || '';
      this.clienteDireccion = cliente.direccion || '';
      this.clienteCorreo = cliente.correo || '';
      this.cdr.detectChanges();
    }
  }

  async buscarDocumento() {
    const doc = String(this.clienteDocumento || '').trim();
    if (!doc) {
      this.messageService?.add({ severity: 'warn', summary: 'Atención', detail: 'Escribe un DNI o RUC' });
      return;
    }

    const clienteExistente = this.clientesBD.find(c => String(c.documento_identidad) === doc);
    if (clienteExistente) {
      this.clienteNombre = clienteExistente.nombre_razon_social || '';
      this.clienteDireccion = clienteExistente.direccion || '';
      this.clienteTelefono = clienteExistente.telefono || '';
      this.clienteCorreo = clienteExistente.correo || '';
      this.messageService?.add({ severity: 'success', summary: 'Local', detail: 'Datos obtenidos de tu Base de Datos.' });
      this.cdr.detectChanges();
      return; 
    }

    if (doc.length !== 8 && doc.length !== 11) {
      this.messageService?.add({ severity: 'warn', summary: 'Error', detail: 'DNI (8) o RUC (11) inválido.' });
      return;
    }

    this.messageService?.add({ severity: 'info', summary: 'Consultando', detail: 'Buscando en SUNAT/RENIEC...' });
    
    try {
      const token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd'; 
      const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
      const respuesta = await fetch(`/api-peru/v1/${tipo}?numero=${doc}`, { headers: { Authorization: `Bearer ${token}` } });
      const datosCrudos = await respuesta.json();

      if (!respuesta.ok || !datosCrudos) throw new Error('No encontrado');

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
        nombreFinal = datos.nombre_o_razon_social || datos.razon_social || datos.razonSocial || datos.nombre_comercial || datos.name || '';
      }

      this.clienteNombre = nombreFinal;
      this.clienteDireccion = datos.direccion_completa || datos.direccion || datos.address || '';
      this.clienteTelefono = ''; 
      this.clienteCorreo = '';

      this.cdr.detectChanges();
      this.messageService?.add({ severity: 'success', summary: 'API', detail: 'Datos obtenidos de SUNAT/RENIEC.' });

    } catch (e) {
      this.messageService?.add({ severity: 'error', summary: 'No Encontrado', detail: 'El documento no existe.' });
    }
  }

  async procesarClienteSilencioso() {
    if (!this.clienteNombre || !this.clienteDocumento) return;
    const existe = this.clientesBD.find(c => c.documento_identidad === this.clienteDocumento);
    if (!existe) {
      try {
        await this.supabaseSvc.guardarCliente({
          nombre_razon_social: this.clienteNombre, documento_identidad: this.clienteDocumento,
          telefono: this.clienteTelefono || null, direccion: this.clienteDireccion || null, correo: this.clienteCorreo || null
        });
      } catch (e) {}
    }
  }

  // ✅ BUENA PRÁCTICA: Inmutabilidad al AGREGAR. (Sin .push)
  agregarFila() {
    const nuevoItem = {
      sku: 'VAR-' + Math.floor(1000 + Math.random() * 9000).toString(),
      descripcion: '', unidad: '', cantidad: null, precio_unitario: null, subtotal: 0
    };
    // Creamos un array nuevo con los elementos que ya había, y añadimos el nuevo al final.
    this.carrito = [...this.carrito, nuevoItem];
  }

  // ✅ BUENA PRÁCTICA: Inmutabilidad al ELIMINAR. (Sin .splice)
  eliminarItem(index: number) {
    // Filtramos para crear un array nuevo que contenga todo EXCEPTO el índice que queremos borrar.
    this.carrito = this.carrito.filter((_, i) => i !== index);
    this.recalcularTodo();
  }

  // ✅ NUEVA FUNCIÓN: Para manejar el estado de los botones de Cantera / Obra desde el HTML
  cambiarLugarEntrega(lugar: string) {
    this.lugarEntrega = lugar;
  }

  filtrarNombresProductos(event: any) {
    const query = event.query.toLowerCase();
    this.nombresProductosFiltrados = this.productosBD.filter(p => p.descripcion.toLowerCase().includes(query)).map(p => p.descripcion);
  }

  alElegirProductoSugerido(event: any, item: any) {
    const producto = this.productosBD.find(p => p.descripcion === (event.value || event));
    if (producto) {
      item.sku = producto.codigo_sku; 
      item.descripcion = producto.descripcion;
      item.unidad = producto.unidad; 
      item.precio_unitario = producto.precio_unitario_base;
      item.cantidad = null; 
      this.recalcularItem(item);
    }
  }

  validarTexto(item: any) {
    if (item.descripcion && item.descripcion.length > 100) {
      item.descripcion = item.descripcion.substring(0, 100);
    }
  }

  recalcularItem(item: any) {
    const cant = item.cantidad || 0; 
    const precio = item.precio_unitario || 0;
    item.subtotal = cant * precio;
    this.recalcularTodo();
  }

  recalcularTodo() {
    this.subtotalGeneral = this.carrito.reduce((acc, item) => acc + Number(item.subtotal), 0);
    this.igvTotal = this.incluyeIgv ? this.subtotalGeneral * 0.18 : 0;
    this.totalFinal = this.subtotalGeneral + this.igvTotal;
    // Aquí sí dejamos el cdr porque es el "reloj" maestro que calcula los totales matemáticos finales.
    this.cdr.detectChanges();
  }

  async generarPDF() {
    const itemsValidos = this.carrito.filter(item => item.descripcion && item.precio_unitario > 0 && item.cantidad > 0);
    if (itemsValidos.length === 0) return;
    
    this.messageService.add({ severity: 'info', summary: 'Procesando', detail: 'Generando cotización...', life: 2000 });

    try {
      await this.procesarClienteSilencioso();

      const codigoEmpresa = this.empresaActiva.id; 
      const empresaParaBD = codigoEmpresa === 'WM' ? 'W&M' : codigoEmpresa;
      
      const folioSeguro = await this.supabaseSvc.obtenerSiguienteFolio(codigoEmpresa);
      
      const cotizacionParaBD: any = {
        folio: folioSeguro, 
        fecha: new Date().toISOString(),
        empresa: empresaParaBD,
        cliente_nombre: this.clienteNombre,
        cliente_documento: this.clienteDocumento,
        subtotal: this.subtotalGeneral,
        igv: this.igvTotal,
        total: this.totalFinal,
        estado: 'PENDIENTE',
        items: itemsValidos,
        lugar_entrega: this.lugarEntrega,
        observaciones: this.clienteObservaciones,
        vendedor: localStorage.getItem('usuario_conectado') || 'Usuario Desconocido'
      };
      
      await this.supabaseSvc.guardarCotizacion(cotizacionParaBD);
      
      await this.pdfSvc.generarYDescargarCotizacion(cotizacionParaBD, this.empresaActiva, this.lugarEntrega, this.clienteObservaciones);
      
    } catch (error) {
      console.error("Error al generar:", error);
    }
  }
}