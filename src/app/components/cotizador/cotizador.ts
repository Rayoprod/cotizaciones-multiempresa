import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';

import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';
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

const DATOS_CORPORATIVOS: any = {
  'WM': {
    nombreComercial: 'W&M E.I.R.L.', razonSocial: null, ruc: '20608657364',
    direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
    telefonos: '959098427 - 914828235', correo: 'wantuilrodriguez123@gmail.com',
    rutaLogo: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/logoswym.png', 
    rutaFirma: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/FIRMA_WANTUIL.jpeg' 
  },
  'VDC': {
    nombreComercial: 'ELECTROFERR. VIRGEN DEL CARMEN', razonSocial: 'MITMA TORRES MARIA LUZ', ruc: '10215770635',
    direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
    telefonos: '959098427 - 914828235', correo: 'wantuilrodriguez123@gmail.com',
    rutaLogo: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/logovdc.jpeg',
    rutaFirma: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/FIRMA_MARIALUZ.png'
  }
};

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
  nombresClientesFiltrados: string[] = [];
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
    private messageService: MessageService
  ) {}

  async ngOnInit() {
    this.agregarFila();

    const datos = localStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : { nombre: 'VDC', color: '#1e40af' };
    const clave = (this.empresaActiva.nombre.toUpperCase().includes('W&M')) ? 'WM' : 'VDC';
    this.datosActuales = DATOS_CORPORATIVOS[clave];

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
      .filter(c => c.nombre_razon_social.toLowerCase().includes(query) || (c.documento_identidad && c.documento_identidad.includes(query)))
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
    const doc = this.clienteDocumento ? this.clienteDocumento.trim() : '';
    if (doc.length !== 8 && doc.length !== 11) return;
    const token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd';
    const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
    
    try {
      const resp = await fetch(`/api-peru/v1/${tipo}?numero=${doc}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) return;
      const datos = await resp.json();
      this.clienteNombre = doc.length === 8 ? `${datos.nombres||''} ${datos.apellidoPaterno||''} ${datos.apellidoMaterno||''}`.trim() : datos.razon_social||datos.razonSocial;
      this.clienteDireccion = datos.direccion || '';
      const c = this.clientesBD.find(c => c.documento_identidad === doc);
      this.clienteTelefono = c?.telefono || ''; this.clienteCorreo = c?.correo || '';
      this.cdr.detectChanges();
    } catch (e) { }
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

  agregarFila() {
    this.carrito.push({
      sku: 'VAR-' + Math.floor(1000 + Math.random() * 9000).toString(),
      descripcion: '', unidad: '', cantidad: null, precio_unitario: null, subtotal: 0
    });
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

  eliminarItem(index: number) {
    this.carrito.splice(index, 1);
    this.recalcularTodo();
  }

  recalcularTodo() {
    this.subtotalGeneral = this.carrito.reduce((acc, item) => acc + Number(item.subtotal), 0);
    this.igvTotal = this.incluyeIgv ? this.subtotalGeneral * 0.18 : 0;
    this.totalFinal = this.subtotalGeneral + this.igvTotal;
    this.cdr.detectChanges();
  }

  async generarPDF() {
    const itemsValidos = this.carrito.filter(item => item.descripcion && item.precio_unitario > 0 && item.cantidad > 0);
    if (itemsValidos.length === 0) return;
    
    // Aviso efímero
    this.messageService.add({
      severity: 'info',
      summary: 'Procesando',
      detail: 'Generando cotización...',
      life: 2000
    });

    const d = new Date();
    const folioVenta = `COT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const empStr = this.empresaActiva.nombre.toUpperCase();
    
    // ✅ OBJETO LIMPIO PARA SUPABASE (No incluye lugar_entrega ni observaciones)
    const cotizacionParaBD: ICotizacion = {
      folio: folioVenta,
      fecha: new Date().toISOString(),
      empresa: (empStr.includes('W&M')) ? 'W&M' : 'VDC',
      cliente_nombre: this.clienteNombre,
      cliente_documento: this.clienteDocumento,
      subtotal: this.subtotalGeneral,
      igv: this.igvTotal,
      total: this.totalFinal,
      estado: 'PENDIENTE',
      items: itemsValidos,
      vendedor: localStorage.getItem('usuario_conectado') || 'Usuario Desconocido'
    };

    try {
      await this.procesarClienteSilencioso();
      
      // ✅ Guardamos en Supabase el objeto LIMPIO para que no lance Error 400
      await this.supabaseSvc.guardarCotizacion(cotizacionParaBD);
      
      // ✅ Pasamos las variables extra DIRECTAMENTE al PDF Service, INCLUYENDO EL IGV
      await this.pdfSvc.generarYDescargarCotizacion(cotizacionParaBD, this.lugarEntrega, this.clienteObservaciones, this.incluyeIgv);
      
    } catch (error) {
      console.error("Error al generar:", error);
    }
  }
}