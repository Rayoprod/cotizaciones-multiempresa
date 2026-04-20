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

const DATOS_CORPORATIVOS: any = {
  'WM': {
    nombreComercial: 'W&M E.I.R.L.', razonSocial: null, ruc: '20608657364',
    direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
    telefonos: '959098427 - 914828235', correo: 'wymvdc1509@gmail.com',
    rutaLogo: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/logowym.png', 
    rutaFirma: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/FIRMA_WANTUIL.jpeg' 
  },
  'VDC': {
    nombreComercial: 'ELECTROFERR. VIRGEN DEL CARMEN', razonSocial: 'MITMA TORRES MARIA LUZ', ruc: '10215770635',
    direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
    telefonos: '959098427 - 914828235', correo: 'wymvdc1509@gmail.com',
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
    TextareaModule, ToggleSwitchModule, AutoCompleteModule, TooltipModule
  ],
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
  lugarEntrega: string = 'CANTERA'; // Sigue guardando el valor de tu preferencia

  subtotalGeneral: number = 0;
  igvTotal: number = 0;
  totalFinal: number = 0;

  constructor(
    private cdr: ChangeDetectorRef,
    private supabaseSvc: SupabaseService,
    private pdfSvc: PdfService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.agregarFila(); // La fila inicial vacía

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
    if (doc.length !== 8 && doc.length !== 11) return alert(`⚠️ DNI 8 dígitos, RUC 11.`);
    const token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd';
    const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
    
    try {
      const resp = await fetch(`/api-peru/v1/${tipo}?numero=${doc}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) return alert('API falló.');
      const datos = await resp.json();
      this.clienteNombre = doc.length === 8 ? `${datos.nombres||''} ${datos.apellidoPaterno||''} ${datos.apellidoMaterno||''}`.trim() : datos.razon_social||datos.razonSocial;
      this.clienteDireccion = datos.direccion || '';
      const c = this.clientesBD.find(c => c.documento_identidad === doc);
      this.clienteTelefono = c?.telefono || ''; this.clienteCorreo = c?.correo || '';
      this.cdr.detectChanges();
    } catch (e) { alert('Fallo de red.'); }
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

  // --- LÓGICA DE TABLA MEJORADA ---
  agregarFila() {
    this.carrito.push({
      sku: 'VAR-' + Math.floor(1000 + Math.random() * 9000).toString(),
      descripcion: '', 
      unidad: '',      // ✅ Nace vacío
      cantidad: null,  // ✅ Nace nulo para obligar al tipeo
      precio_unitario: null, 
      subtotal: 0
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
      
      // ✅ OBLIGAMOS a que la cantidad quede nula, incluso si se encontró el producto
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
    const cant = item.cantidad || 0; // Si es null, calcula como 0
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
    // ✅ Ahora validamos que obligatoriamente hayan puesto cantidad
    const itemsValidos = this.carrito.filter(item => item.descripcion && item.precio_unitario > 0 && item.cantidad > 0);
    if (itemsValidos.length === 0) return alert("Agrega al menos un producto con precio y CANTIDAD asignada.");
    
    await this.procesarClienteSilencioso();
    const d = new Date();
    const folioVenta = `COT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const empStr = this.empresaActiva.nombre.toUpperCase();
    
    // ... dentro de generarPDF()
const nuevaCotizacion: ICotizacion = {
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
  
  // ✅ AQUÍ SE SOLUCIONA EL "SISTEMA": Capturamos el correo real
  vendedor: localStorage.getItem('usuario_conectado') || 'Usuario Desconocido'
};

    try {
      await this.supabaseSvc.guardarCotizacion(nuevaCotizacion);
      await this.pdfSvc.generarYDescargarCotizacion(nuevaCotizacion);
      alert(`¡Éxito! Cotización ${folioVenta} generada y descargada.`);
    } catch (error) {
      alert("Error al guardar en la base de datos.");
    }
  }
}