import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';

// Servicios y Modelos
import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service'; // <-- Importamos nuestro servicio
import { ICotizacion } from '../../models/cotizacion.model';

// PrimeNG
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AutoCompleteModule } from 'primeng/autocomplete';

const DATOS_CORPORATIVOS: any = {
  'WM': {
    nombreComercial: 'W&M E.I.R.L.',
    razonSocial: null,
    ruc: '20608657364',
    direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
    telefonos: '959098427 - 914828235',
    correo: 'wymvdc1509@gmail.com',
    rutaLogo: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/logowym.png', 
    rutaFirma: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/FIRMA_WANTUIL.jpeg' 
  },
  'VDC': {
    nombreComercial: 'ELECTROFERR. VIRGEN DEL CARMEN',
    razonSocial: 'MITMA TORRES MARIA LUZ',
    ruc: '10215770635',
    direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
    telefonos: '959098427 - 914828235',
    correo: 'wymvdc1509@gmail.com',
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
    TextareaModule, SelectButtonModule, ToggleSwitchModule, AutoCompleteModule
  ],
  templateUrl: './cotizador.html',
  styleUrl: './cotizador.scss'
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
  clienteSeleccionado: any = null;
  clienteDocumento: string = '';
  clienteTelefono: string = '';
  clienteDireccion: string = '';
  clienteCorreo: string = '';
  clienteObservaciones: string = '';

  productoNombre: string = '';
  productoSeleccionado: any = null;
  inputUnidad: string = 'm3';
  inputCantidad: number = 1;
  inputPrecio: number | null = null;
  
  incluyeIgv: boolean = true;
  lugarEntrega: string = 'CANTERA';
  opcionesEntrega = [
    { label: 'En Cantera', value: 'CANTERA', icon: 'pi pi-map-marker' },
    { label: 'En Obra', value: 'OBRA', icon: 'pi pi-truck' }
  ];

  subtotalGeneral: number = 0;
  igvTotal: number = 0;
  totalFinal: number = 0;

  constructor(
    private cdr: ChangeDetectorRef,
    private supabaseSvc: SupabaseService,
    private pdfSvc: PdfService, // <-- Inyectamos el servicio
    private router: Router
  ) {}

  async ngOnInit() {
    const datos = localStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : { nombre: 'VDC', color: '#1e40af' };
    
    const nombreEmp = this.empresaActiva.nombre.toUpperCase();
    const clave = (nombreEmp.includes('W&M') || nombreEmp.includes('WYM') || nombreEmp.includes('WM')) ? 'WM' : 'VDC';
    
    this.datosActuales = DATOS_CORPORATIVOS[clave];

    await this.cargarDatosDesdeBD();
  }

  async cargarDatosDesdeBD() {
    try {
      this.productosBD = await this.supabaseSvc.getProductos();
      this.clientesBD = await this.supabaseSvc.getClientes();
      this.cdr.detectChanges();
    } catch (error) {
      console.error("Error cargando catálogos:", error);
    }
  }

  filtrarNombresClientes(event: any) {
    const query = event.query.toLowerCase();
    this.nombresClientesFiltrados = this.clientesBD
      .filter(c => c.nombre_razon_social.toLowerCase().includes(query) || 
                  (c.documento_identidad && c.documento_identidad.includes(query)))
      .map(c => c.nombre_razon_social);
  }

  alElegirNombreSugerido(event: any) {
    const nombreElegido = event.value || event;
    const cliente = this.clientesBD.find(c => c.nombre_razon_social === nombreElegido);
    
    if (cliente) {
      this.clienteSeleccionado = cliente;
      this.clienteNombre = cliente.nombre_razon_social;
      this.clienteDocumento = cliente.documento_identidad || '';
      this.clienteTelefono = cliente.telefono || '';
      this.clienteDireccion = cliente.direccion || '';
      this.clienteCorreo = cliente.correo || '';
      this.cdr.detectChanges();
    }
  }

  filtrarNombresProductos(event: any) {
    const query = event.query.toLowerCase();
    this.nombresProductosFiltrados = this.productosBD
      .filter(p => p.descripcion.toLowerCase().includes(query))
      .map(p => p.descripcion);
  }

  alElegirProductoSugerido(event: any) {
    const nombreElegido = event.value || event;
    const producto = this.productosBD.find(p => p.descripcion === nombreElegido);
    
    if (producto) {
      this.productoSeleccionado = producto;
      this.productoNombre = producto.descripcion;
      this.inputPrecio = producto.precio_unitario_base;
      this.inputUnidad = producto.unidad;
      this.cdr.detectChanges();
    }
  }

  async buscarDocumento() {
    const doc = this.clienteDocumento ? this.clienteDocumento.trim() : '';

    if (doc.length !== 8 && doc.length !== 11) {
      alert(`⚠️ ERROR: Escribiste ${doc.length} dígitos. El DNI debe tener 8 y el RUC 11.`);
      return;
    }

    const token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd';
    const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
    const url = `/api-peru/v1/${tipo}?numero=${doc}`;

    try {
      const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      
      if (!respuesta.ok) {
        if (respuesta.status === 401 || respuesta.status === 403) {
            alert(`⛔ TU TOKEN NO TIENE PERMISOS PARA DNI (Error ${respuesta.status}).`);
        } else {
            alert(`⚠️ La API falló con código ${respuesta.status}. No se encontraron datos.`);
        }
        return;
      }
      
      const datos = await respuesta.json();
      let nombreExtraido = '';
      
      if (doc.length === 8) {
        const nom = datos.nombres || datos.nombre || datos.first_name || '';
        const pat = datos.apellidoPaterno || datos.apellido_paterno || datos.first_last_name || '';
        const mat = datos.apellidoMaterno || datos.apellido_materno || datos.second_last_name || '';
        
        nombreExtraido = `${nom} ${pat} ${mat}`.trim();
        if (!nombreExtraido && datos.nombre_completo) nombreExtraido = datos.nombre_completo;
        if (!nombreExtraido && datos.full_name) nombreExtraido = datos.full_name;
      } else {
        nombreExtraido = datos.razon_social || datos.razonSocial || datos.nombre || datos.nombre_comercial || '';
      }

      this.clienteNombre = nombreExtraido; 
      this.clienteDireccion = datos.direccion || '';

      const clienteBD = this.clientesBD.find(c => c.documento_identidad === doc);
      if (clienteBD) {
        this.clienteTelefono = clienteBD.telefono || '';
        this.clienteCorreo = clienteBD.correo || '';
      } else {
        this.clienteTelefono = '';
        this.clienteCorreo = '';
      }

      this.cdr.detectChanges();

    } catch (error) {
      console.error('ERROR DE RED', error);
      alert('Fallo de red: Revisa tu conexión.');
    }
  }

  async procesarClienteSilencioso() {
    if (!this.clienteNombre || !this.clienteDocumento) return;
    const existe = this.clientesBD.find(c => c.documento_identidad === this.clienteDocumento);

    if (!existe) {
      const nuevo = {
        nombre_razon_social: this.clienteNombre,
        documento_identidad: this.clienteDocumento,
        telefono: this.clienteTelefono || null,
        direccion: this.clienteDireccion || null,
        correo: this.clienteCorreo || null
      };
      
      try {
        const clienteGuardado = await this.supabaseSvc.guardarCliente(nuevo);
        if (clienteGuardado) this.clientesBD.push(clienteGuardado);
      } catch (error) {
        console.error("No se pudo guardar el cliente silenciosamente", error);
      }
    }
  }

  async agregarItem() {
    if (!this.productoNombre || !this.inputPrecio || this.inputPrecio <= 0) return;
    let skuFinal = this.productoSeleccionado ? this.productoSeleccionado.codigo_sku : 'VAR-' + Math.floor(1000 + Math.random() * 9000).toString();

    this.carrito.push({
      sku: skuFinal,
      descripcion: this.productoNombre,
      unidad: this.inputUnidad,
      cantidad: this.inputCantidad,
      precio_unitario: this.inputPrecio,
      subtotal: this.inputPrecio * this.inputCantidad
    });

    this.productoNombre = '';
    this.productoSeleccionado = null;
    this.inputPrecio = null;
    this.inputCantidad = 1;
    this.inputUnidad = 'm3';
    this.recalcularTodo();
  }

  recalcularItem(item: any) {
    item.subtotal = item.cantidad * item.precio_unitario;
    this.recalcularTodo();
  }

  eliminarItem(index: number) {
    this.carrito.splice(index, 1);
    this.recalcularTodo();
  }

  recalcularTodo() {
    const base = this.carrito.reduce((acc, item) => acc + Number(item.subtotal), 0);
    this.subtotalGeneral = base;
    this.igvTotal = this.incluyeIgv ? base * 0.18 : 0;
    this.totalFinal = this.subtotalGeneral + this.igvTotal;
    this.cdr.detectChanges();
  }

  generarFolioCotizacion(): string {
    const d = new Date();
    return `COT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // 🔥 LA FUNCIÓN MAESTRA (AHORA DELEGA EL TRABAJO PESADO)
  async generarPDF() {
    if (this.carrito.length === 0) {
      alert("Por favor agrega al menos un producto.");
      return;
    }

    await this.procesarClienteSilencioso();
    const folioVenta = this.generarFolioCotizacion();

    const empStr = this.empresaActiva.nombre.toUpperCase();
    const empresaValida = (empStr.includes('W&M') || empStr.includes('WM')) ? 'W&M' : 'VDC';

    const nuevaCotizacion: ICotizacion = {
      folio: folioVenta,
      fecha: new Date().toISOString(),
      empresa: empresaValida, 
      cliente_nombre: this.clienteNombre,
      cliente_documento: this.clienteDocumento,
      subtotal: this.subtotalGeneral,
      igv: this.igvTotal,
      total: this.totalFinal,
      estado: 'PENDIENTE',
      items: this.carrito
    };

    try {
      // 1. Guardamos en Supabase
      await this.supabaseSvc.guardarCotizacion(nuevaCotizacion);

      // 2. Le decimos al servicio que dibuje y descargue el PDF (¡Una sola línea!)
      await this.pdfSvc.generarYDescargarCotizacion(nuevaCotizacion);

      // 3. Viaje final al historial
      this.router.navigate(['/historial']);

    } catch (error) {
      console.error("Error al guardar la cotización:", error);
      alert("Hubo un error al guardar en la base de datos, revisa la consola.");
    }
  }
}