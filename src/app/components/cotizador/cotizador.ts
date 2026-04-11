import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

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

// Supabase
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

// PDF
import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';

const fuentes: any = pdfFonts;
const vfsReal = fuentes.vfs || fuentes.pdfMake?.vfs || fuentes.default?.pdfMake?.vfs;
Object.assign(pdfMake, { vfs: vfsReal });

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
  
  private supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  
  empresaActiva: any;
  datosActuales: any;
  
  productosBD: any[] = [];
  clientesBD: any[] = [];
  
  // ARRAYS PARA EL BUSCADOR (SÓLO TEXTO)
  nombresClientesFiltrados: string[] = [];
  nombresProductosFiltrados: string[] = [];

  carrito: any[] = [];
  
  // VARIABLES CLIENTE
  clienteNombre: string = ''; 
  clienteSeleccionado: any = null;
  clienteDocumento: string = '';
  clienteTelefono: string = '';
  clienteDireccion: string = '';
  clienteCorreo: string = '';
  clienteObservaciones: string = '';

  // VARIABLES PRODUCTO
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

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    const datos = localStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : { nombre: 'VDC', color: '#1e40af' };
    
    const nombreEmp = this.empresaActiva.nombre.toUpperCase();
    const clave = (nombreEmp.includes('W&M') || nombreEmp.includes('WYM') || nombreEmp.includes('WM')) ? 'WM' : 'VDC';
    
    this.datosActuales = DATOS_CORPORATIVOS[clave];

    await this.cargarDatosDesdeBD();
  }

  async cargarDatosDesdeBD() {
    const { data: dataProductos } = await this.supabase.from('productos').select('*').order('descripcion');
    if (dataProductos) this.productosBD = dataProductos;

    const { data: dataClientes } = await this.supabase.from('clientes').select('*').order('nombre_razon_social');
    if (dataClientes) this.clientesBD = dataClientes;
    this.cdr.detectChanges();
  }

  // ==========================================
  // BUSCADORES DE BASE DE DATOS (RESTAURADOS)
  // ==========================================
  filtrarNombresClientes(event: any) {
    const query = event.query.toLowerCase();
    this.nombresClientesFiltrados = this.clientesBD
      .filter(c => c.nombre_razon_social.toLowerCase().includes(query) || 
                  (c.documento_identidad && c.documento_identidad.includes(query)))
      .map(c => c.nombre_razon_social); // Pasamos solo textos al AutoComplete
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

  // ==========================================
  // LUPA SUNAT/RENIEC (REPARADA)
  // ==========================================
  async buscarDocumento() {
    console.log('🟢 PASO 1: Botón presionado. Iniciando búsqueda...');
    
    // Validamos que exista el input
    const doc = this.clienteDocumento ? this.clienteDocumento.trim() : '';
    console.log(`🟢 PASO 2: Documento capturado: "${doc}" (Longitud: ${doc.length} dígitos)`);

    if (doc.length !== 8 && doc.length !== 11) {
      alert(`⚠️ ERROR: Escribiste ${doc.length} dígitos. El DNI debe tener 8 y el RUC 11.`);
      return;
    }

    const token = 'sk_14593.YFyX7enin7im5akcMSHwBZRbotkfcxPo';
    const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
    const url = `/api-peru/v1/${tipo}?numero=${doc}`;

    console.log(`🟢 PASO 3: Intentando conectar a la ruta: ${url}`);

    try {
      const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      
      console.log(`🟢 PASO 4: La API respondió con código de estado HTTP: ${respuesta.status}`);

      if (!respuesta.ok) {
        console.error('🔴 ERROR CRÍTICO: La API rechazó la consulta.');
        if (respuesta.status === 401 || respuesta.status === 403) {
            alert(`⛔ TU TOKEN NO TIENE PERMISOS PARA DNI (Error ${respuesta.status}). \n\nMuchas APIs gratuitas bloquean Reniec. Confírmalo en la consola.`);
        } else {
            alert(`⚠️ La API falló con código ${respuesta.status}. No se encontraron datos.`);
        }
        return;
      }
      
      const datos = await respuesta.json();
      console.log('🟢 PASO 5: ¡DATOS RECIBIDOS CON ÉXITO! Aquí están 👇:', datos);

      let nombreExtraido = '';
      if (doc.length === 8) {
        // 🔥 BLINDAJE PARA DNI: Agregamos las variables en inglés que descubrimos en la consola
        const nom = datos.nombres || datos.nombre || datos.first_name || '';
        const pat = datos.apellidoPaterno || datos.apellido_paterno || datos.first_last_name || '';
        const mat = datos.apellidoMaterno || datos.apellido_materno || datos.second_last_name || '';
        
        nombreExtraido = `${nom} ${pat} ${mat}`.trim();
        
        // Fallbacks por si manda todo en una sola línea
        if (!nombreExtraido && datos.nombre_completo) nombreExtraido = datos.nombre_completo;
        if (!nombreExtraido && datos.full_name) nombreExtraido = datos.full_name;
        
      } else {
        // RUC (Sunat)
        nombreExtraido = datos.razon_social || datos.razonSocial || datos.nombre || datos.nombre_comercial || '';
      }

      console.log(`🟢 PASO 6: Nombre limpio para inyectar en pantalla: "${nombreExtraido}"`);

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
      console.log('🟢 PASO 7: PANTALLA ACTUALIZADA. Fin del proceso.');

    } catch (error) {
      console.error('🔴 PASO X: ERROR DE RED O DEL PROXY', error);
      alert('Fallo de red: Revisa que tu servidor Proxy (localhost) esté encendido y funcionando.');
    }
  }

  // ==========================================
  // RESTO DE FUNCIONES (CARRITO Y PDF)
  // ==========================================
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
      const { data } = await this.supabase.from('clientes').insert([nuevo]).select();
      if (data) {
        this.clientesBD.push(data[0]);
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

  formatearTextoLargo(texto: string): string {
    if (!texto) return '';
    return texto.split(' ').map(palabra => palabra.length > 25 ? palabra.match(/.{1,25}/g)?.join('\u200B') : palabra).join(' ');
  }

  async cargarImagenRemota(url: string): Promise<string | null> {
    if (!url) return null;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) { return null; }
  }

  generarFolioCotizacion(): string {
    const d = new Date();
    return `COT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async generarPDF() {
    await this.procesarClienteSilencioso();
    const nombreFinal = this.clienteNombre; // <-- Aquí usamos la variable ya reparada
    const datosEmpresa = this.datosActuales;
    const folioVenta = this.generarFolioCotizacion();

    const logoConvertido = await this.cargarImagenRemota(datosEmpresa.rutaLogo);
    const firmaConvertida = await this.cargarImagenRemota(datosEmpresa.rutaFirma);

    const logoIzquierda = logoConvertido 
      ? { image: logoConvertido, width: 80 } 
      : { text: `LOGO\n${datosEmpresa.nombreComercial}`, color: this.empresaActiva.color, fontSize: 10, bold: true, width: 130 };

    const firmaDerecha = firmaConvertida
      ? { image: firmaConvertida, width: 120, alignment: 'center' }
      : { text: `________________________________\nGerencia General\n${datosEmpresa.nombreComercial}`, alignment: 'center', fontSize: 9, color: '#4b5563' };

    const anchosTabla = [25, '*', 35, 40, 60, 70];
    
    const filasItems: any[] = [
      [{ text: 'Ítem', style: 'tableHeader' }, { text: 'Descripción', style: 'tableHeader' }, { text: 'Unid.', style: 'tableHeader' }, { text: 'Cant.', style: 'tableHeader' }, { text: 'P. Unit.', style: 'tableHeader' }, { text: 'Subtotal', style: 'tableHeader' }]
    ];

    this.carrito.forEach((item, index) => {
      filasItems.push([
        { text: (index + 1).toString(), style: 'tableBody', alignment: 'center', bold: true, color: '#4b5563' },
        { text: this.formatearTextoLargo(item.descripcion), style: 'tableBody' },
        { text: item.unidad, style: 'tableBody', alignment: 'center' },
        { text: item.cantidad.toString(), style: 'tableBody', alignment: 'center' },
        { text: `S/ ${item.precio_unitario.toFixed(2)}`, style: 'tableBody', alignment: 'right' },
        { text: `S/ ${item.subtotal.toFixed(2)}`, style: 'tableBody', alignment: 'right', bold: true }
      ]);
    });

    if (this.carrito.length === 0) {
        filasItems.push([{ text: '1', style: 'tableBody', alignment: 'center' }, { text: 'Sin ítems', style: 'tableBody' }, '', '', '', '']);
    }

    const filasTotales: any[] = [
      [{ text: 'Subtotal:', colSpan: 5, alignment: 'right', bold: true, fontSize: 10, margin: [0, 5, 0, 0] }, '', '', '', '', { text: `S/ ${this.subtotalGeneral.toFixed(2)}`, alignment: 'right', fontSize: 10, margin: [0, 5, 0, 0] }]
    ];

    if (this.incluyeIgv) {
      filasTotales.push([{ text: 'IGV (18%):', colSpan: 5, alignment: 'right', bold: true, fontSize: 10 }, '', '', '', '', { text: `S/ ${this.igvTotal.toFixed(2)}`, alignment: 'right', fontSize: 10 }]);
    }
    filasTotales.push([{ text: 'TOTAL FINAL:', colSpan: 5, alignment: 'right', bold: true, fontSize: 12 }, '', '', '', '', { text: `S/ ${this.totalFinal.toFixed(2)}`, alignment: 'right', bold: true, fontSize: 12, color: this.empresaActiva.color }]);

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 130, 40, 50], 
      
      header: () => {
        return {
          margin: [40, 20, 40, 0],
          stack: [
            {
              columns: [
                logoIzquierda,
                {
                  width: '*',
                  text: [
                    { text: `COTIZACIÓN N° ${folioVenta}\n`, fontSize: 14, bold: true, color: this.empresaActiva.color, alignment: 'right' },
                    { text: `${datosEmpresa.nombreComercial}\n`, bold: true, fontSize: 10, alignment: 'right' },
                    ...(datosEmpresa.razonSocial ? [{ text: `${datosEmpresa.razonSocial}\n`, fontSize: 9, alignment: 'right' }] : []),
                    { text: `RUC: ${datosEmpresa.ruc}\n`, alignment: 'right', fontSize: 9, color: '#4b5563' },
                    { text: `${datosEmpresa.direccion}\n`, alignment: 'right', fontSize: 8, color: '#4b5563', leadingIndent: 0 },
                    { text: `Cel: ${datosEmpresa.telefonos}\n`, alignment: 'right', fontSize: 8, color: '#4b5563' },
                    { text: `${datosEmpresa.correo}\n`, alignment: 'right', fontSize: 8, color: '#4b5563' },
                    { text: `Fecha: ${new Date().toLocaleDateString()}`, alignment: 'right', fontSize: 9, bold: true, margin: [0, 3, 0, 0] }
                  ]
                }
              ]
            },
            { canvas: [{ type: 'line', x1: 0, y1: 10, x2: 515, y2: 10, lineWidth: 2, lineColor: this.empresaActiva.color }] }
          ]
        };
      },

      footer: (currentPage: number, pageCount: number) => {
        return { margin: [40, 10, 40, 0], text: `Página ${currentPage} de ${pageCount}`, alignment: 'center', fontSize: 8, color: '#9ca3af' };
      },

      content: [
        {
          style: 'clienteBox',
          table: {
            widths: ['100%'],
            body: [[{
              columns: [
                { width: '60%', text: [{ text: 'Atención a:\n', fontSize: 8, color: '#6b7280' }, { text: `${nombreFinal}\n`, bold: true, fontSize: 11 }, { text: `RUC/DNI: `, bold: true, fontSize: 9 }, { text: `${this.clienteDocumento}`, fontSize: 9 }] },
                { width: '40%', text: [{ text: `Dirección: `, bold: true, fontSize: 9 }, { text: `${this.clienteDireccion || 'No especificada'}\n`, fontSize: 9 }, { text: `Teléfono: `, bold: true, fontSize: 9 }, { text: `${this.clienteTelefono || '-'}\n`, fontSize: 9 }, { text: `Correo: `, bold: true, fontSize: 9 }, { text: `${this.clienteCorreo || '-'}`, fontSize: 9 }], alignment: 'right' }
              ], fillColor: '#f9fafb', border: [false, false, false, false], margin: [10, 10, 10, 10]
            }]]
          }, margin: [0, 0, 0, 15]
        },

        {
          stack: [
            { 
              table: { 
                headerRows: 1, 
                widths: anchosTabla, 
                body: filasItems,
                dontBreakRows: true 
              }, 
              layout: { 
                hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5, 
                vLineWidth: () => 0, 
                hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? this.empresaActiva.color : '#d1d5db', 
                paddingTop: () => 5, 
                paddingBottom: () => 5 
              }
            },
            { 
              table: { widths: anchosTabla, body: filasTotales }, 
              layout: 'noBorders', 
              margin: [0, 5, 0, 0] 
            }
          ],
          unbreakable: false 
        },

        {
          unbreakable: true, 
          stack: [
            {
              table: {
                widths: ['50%', '50%'],
                body: [
                  [
                    { text: 'OBSERVACIONES', style: 'boxHeader' },
                    { text: 'CONDICIONES DE VENTA Y PAGOS', style: 'boxHeader' }
                  ],
                  [
                    { text: this.clienteObservaciones.substring(0, 500) || 'Ninguna especificación adicional.', style: 'boxContent' },
                    {
                      stack: [
                        { text: `• Entrega: ${this.lugarEntrega === 'CANTERA' ? 'RECOGIDO EN CANTERA' : 'ENTREGADO EN OBRA'}`, margin: [0, 0, 0, 2] },
                        { text: `• Precios ${this.incluyeIgv ? 'SÍ INCLUYEN' : 'NO INCLUYEN'} IGV (18%)`, margin: [0, 0, 0, 2] },
                        { text: '• Validez de cotización: 15 días', margin: [0, 0, 0, 8] },
                        { text: 'CUENTAS PARA ABONO', style: 'boxHeaderSmall' },
                        { text: '• Detracción B. Nación: 00615009040', margin: [0, 0, 0, 2] },
                        { text: '• Cta. BCP: 194-20587879-0-35', margin: [0, 0, 0, 2] },
                        { text: '• CCI BCP: 00219412058787903595' }
                      ],
                      style: 'boxContent'
                    }
                  ]
                ]
              },
              layout: {
                hLineWidth: function () { return 0.5; },
                vLineWidth: function () { return 0.5; },
                hLineColor: function () { return '#d1d5db'; },
                vLineColor: function () { return '#d1d5db'; },
                paddingLeft: function() { return 10; },
                paddingRight: function() { return 10; },
                paddingTop: function() { return 8; },
                paddingBottom: function() { return 8; }
              },
              margin: [0, 25, 0, 20]
            },
            
            {
              columns: [
                { width: '*', text: '' }, 
                { width: 200, stack: [firmaDerecha] } 
              ], margin: [0, 10, 0, 0]
            }
          ]
        }
      ],
      styles: { 
        tableHeader: { bold: true, fontSize: 10, color: 'white', fillColor: this.empresaActiva.color, alignment: 'center', margin: [0, 4, 0, 4] }, 
        tableBody: { fontSize: 9, margin: [0, 4, 0, 4] }, 
        clienteBox: { margin: [0, 0, 0, 0] },
        boxHeader: { bold: true, fontSize: 9, color: this.empresaActiva.color, fillColor: '#f9fafb', margin: [0, 2, 0, 2] },
        boxHeaderSmall: { bold: true, fontSize: 8, color: this.empresaActiva.color, margin: [0, 0, 0, 4] },
        boxContent: { fontSize: 8, color: '#374151', margin: [0, 4, 0, 4] }
      }
    };

    const nombreArchivo = `${folioVenta}_${this.empresaActiva.nombre.replace(/\s+/g, '_')}_${(nombreFinal || 'Cliente').replace(/\s+/g, '_')}.pdf`;
    const generadorPdf = (pdfMake as any).default || pdfMake;
    generadorPdf.createPdf(docDefinition).download(nombreArchivo);
  }
}