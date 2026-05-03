import { Injectable } from '@angular/core';
import { ICotizacion } from '../models/cotizacion.model';

import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';

const fuentes: any = pdfFonts;
const vfsReal = fuentes.vfs || fuentes.pdfMake?.vfs || fuentes.default?.pdfMake?.vfs;
Object.assign(pdfMake, { vfs: vfsReal });


@Injectable({ providedIn: 'root' })
export class PdfService {

  async cargarImagenRemota(url: string): Promise<string | null> {
    if (!url) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null; 
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) { return null; }
  }

  formatearTextoLargo(texto: string): string {
    if (!texto) return '';
    return texto.split(' ').map(palabra => palabra.length > 25 ? palabra.match(/.{1,25}/g)?.join('\u200B') : palabra).join(' ');
  }

  // 👇 Fíjate que aquí agregamos "datosEmpresa: any" para recibir la información
  async generarYDescargarCotizacion(data: ICotizacion, datosEmpresa: any, lugarEntrega: string = '', observaciones: string = '') {
    
    if (!datosEmpresa) return;

    // 🔥 CORRECCIÓN 1: Usar nombres exactos de Supabase (con guion bajo)
    const logoConvertido = await this.cargarImagenRemota(datosEmpresa.ruta_logo);
    const firmaConvertida = await this.cargarImagenRemota(datosEmpresa.ruta_firma);

    const logoIzquierda = logoConvertido 
      ? { image: logoConvertido, width: 80 } 
      : { text: `LOGO\n${datosEmpresa.nombre_comercial}`, color: datosEmpresa.color, fontSize: 10, bold: true, width: 130 };

    const firmaDerecha = firmaConvertida
      ? { image: firmaConvertida, width: 120, alignment: 'center' }
      : { text: `________________________________\nGerencia General\n${datosEmpresa.nombre_comercial}`, alignment: 'center', fontSize: 9, color: '#4b5563' };

    const anchosTabla = [25, '*', 35, 40, 60, 70];
    const filasItems: any[] = [
      [{ text: 'Ítem', style: 'tableHeader' }, { text: 'Descripción', style: 'tableHeader' }, { text: 'Unid.', style: 'tableHeader' }, { text: 'Cant.', style: 'tableHeader' }, { text: 'P. Unit.', style: 'tableHeader' }, { text: 'Subtotal', style: 'tableHeader' }]
    ];

    data.items.forEach((item: any, index: number) => {
      filasItems.push([
        { text: (index + 1).toString(), style: 'tableBody', alignment: 'center', bold: true, color: '#4b5563' },
        { text: this.formatearTextoLargo(item.descripcion), style: 'tableBody' },
        { text: item.unidad, style: 'tableBody', alignment: 'center' },
        { text: item.cantidad.toString(), style: 'tableBody', alignment: 'center' },
        { text: `S/ ${Number(item.precio_unitario).toFixed(2)}`, style: 'tableBody', alignment: 'right' },
        { text: `S/ ${Number(item.subtotal).toFixed(2)}`, style: 'tableBody', alignment: 'right', bold: true }
      ]);
    });

    const tieneIgv = Number(data.igv) > 0;

    const filasTotales: any[] = [
      [{ text: 'Subtotal:', colSpan: 5, alignment: 'right', bold: true, fontSize: 10, margin: [0, 5, 0, 0] }, '', '', '', '', { text: `S/ ${Number(data.subtotal).toFixed(2)}`, alignment: 'right', fontSize: 10, margin: [0, 5, 0, 0] }]
    ];

    if (tieneIgv) {
      filasTotales.push([{ text: 'IGV (18%):', colSpan: 5, alignment: 'right', bold: true, fontSize: 10 }, '', '', '', '', { text: `S/ ${Number(data.igv).toFixed(2)}`, alignment: 'right', fontSize: 10 }]);
    }
    filasTotales.push([{ text: 'TOTAL FINAL:', colSpan: 5, alignment: 'right', bold: true, fontSize: 12 }, '', '', '', '', { text: `S/ ${Number(data.total).toFixed(2)}`, alignment: 'right', bold: true, fontSize: 12, color: datosEmpresa.color }]);

    const fechaFormat = new Date(data.fecha).toLocaleDateString('es-PE');
    
    const entregaRaw = String(lugarEntrega || (data as any).lugar_entrega || '').toUpperCase().trim();
    const obsFinal = observaciones || (data as any).observaciones || '';

    let textoEntrega = 'NO ESPECIFICADO';
    if (entregaRaw.includes('CANTERA')) textoEntrega = 'PUESTO EN CANTERA';
    else if (entregaRaw.includes('OBRA')) textoEntrega = 'PUESTO EN OBRA (CON FLETE)';

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
                    { text: `COTIZACIÓN N° ${data.folio}\n`, fontSize: 14, bold: true, color: datosEmpresa.color, alignment: 'right' },
                    // 🔥 CORRECCIÓN 2: nombres exactos de Supabase
                    { text: `${datosEmpresa.nombre_comercial || 'EMPRESA'}\n`, bold: true, fontSize: 10, alignment: 'right' },
                    ...(datosEmpresa.razon_social ? [{ text: `${datosEmpresa.razon_social}\n`, fontSize: 9, alignment: 'right' }] : []),
                    { text: `RUC: ${datosEmpresa.ruc || '-'}\n`, alignment: 'right', fontSize: 9, color: '#4b5563' },
                    { text: `${datosEmpresa.direccion || '-'}\n`, alignment: 'right', fontSize: 8, color: '#4b5563', leadingIndent: 0 },
                    { text: `Cel: ${datosEmpresa.telefonos || '-'}\n`, alignment: 'right', fontSize: 8, color: '#4b5563' },
                    { text: `${datosEmpresa.correo || '-'}\n`, alignment: 'right', fontSize: 8, color: '#4b5563' },
                    { text: `Fecha: ${fechaFormat}`, alignment: 'right', fontSize: 9, bold: true, margin: [0, 3, 0, 0] }
                  ]
                }
              ]
            },
            { canvas: [{ type: 'line', x1: 0, y1: 10, x2: 515, y2: 10, lineWidth: 2, lineColor: datosEmpresa.color }] }
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
                { width: '60%', text: [{ text: 'Atención a:\n', fontSize: 8, color: '#6b7280' }, { text: `${data.cliente_nombre}\n`, bold: true, fontSize: 11 }, { text: `RUC/DNI: `, bold: true, fontSize: 9 }, { text: `${data.cliente_documento}`, fontSize: 9 }] },
                { width: '40%', text: [{ text: `Dirección: `, bold: true, fontSize: 9 }, { text: `No especificada\n`, fontSize: 9 }, { text: `Teléfono: `, bold: true, fontSize: 9 }, { text: `-\n`, fontSize: 9 }, { text: `Correo: `, bold: true, fontSize: 9 }, { text: `-`, fontSize: 9 }], alignment: 'right' }
              ], fillColor: '#f9fafb', border: [false, false, false, false], margin: [10, 10, 10, 10]
            }]]
          }, margin: [0, 0, 0, 15]
        },
        {
          stack: [
            { 
              table: { headerRows: 1, widths: anchosTabla, body: filasItems, dontBreakRows: true }, 
              layout: { 
                hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5, 
                vLineWidth: () => 0, 
                hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? datosEmpresa.color : '#d1d5db', 
                paddingTop: () => 5, paddingBottom: () => 5 
              }
            },
            { table: { widths: anchosTabla, body: filasTotales }, layout: 'noBorders', margin: [0, 5, 0, 0] }
          ], unbreakable: false 
        },
        {
          unbreakable: true, 
          stack: [
            {
              table: {
                widths: ['50%', '50%'],
                body: [
                  [{ text: 'DATOS DE ENTREGA Y OBSERVACIONES', style: 'boxHeader' }, { text: 'CONDICIONES DE VENTA Y PAGOS', style: 'boxHeader' }],
                  [
                    { 
                      stack: [
                        { text: [ { text: '• Punto de Entrega: ', bold: true }, { text: textoEntrega } ], margin: [0, 0, 0, 4] },
                        { text: [ { text: '• Impuestos: ', bold: true }, { text: tieneIgv ? 'PRECIOS INCLUYEN IGV (18%)' : 'PRECIOS NO INCLUYEN IGV' } ], margin: [0, 0, 0, 4] },
                        { text: [ { text: '• Notas: ', bold: true }, { text: obsFinal ? obsFinal : 'Ninguna especificación adicional.' } ] }
                      ],
                      style: 'boxContent' 
                    },
                    { stack: [ { text: 'CUENTAS PARA ABONO', style: 'boxHeaderSmall' }, { text: '• Detracción B. Nación: 00615009040', margin: [0, 0, 0, 2] }, { text: '• Cta. BCP: 194-20587879-0-35', margin: [0, 0, 0, 2] }, { text: '• CCI BCP: 00219412058787903595' } ], style: 'boxContent' }
                  ]
                ]
              },
              layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#d1d5db', vLineColor: () => '#d1d5db', paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8 }, margin: [0, 25, 0, 20]
            },
            { columns: [{ width: '*', text: '' }, { width: 200, stack: [firmaDerecha] } ], margin: [0, 10, 0, 0] }
          ]
        }
      ],
      styles: { 
        tableHeader: { bold: true, fontSize: 10, color: 'white', fillColor: datosEmpresa.color, alignment: 'center', margin: [0, 4, 0, 4] }, 
        tableBody: { fontSize: 9, margin: [0, 4, 0, 4] }, 
        clienteBox: { margin: [0, 0, 0, 0] },
        boxHeader: { bold: true, fontSize: 9, color: datosEmpresa.color, fillColor: '#f9fafb', margin: [0, 2, 0, 2] },
        boxHeaderSmall: { bold: true, fontSize: 8, color: datosEmpresa.color, margin: [0, 0, 0, 4] },
        boxContent: { fontSize: 8, color: '#374151', margin: [0, 4, 0, 4] }
      }
    };

    const nombreArchivo = `${data.folio}_${data.empresa.replace(/\s+/g, '_')}_${data.cliente_nombre.replace(/\s+/g, '_')}.pdf`;
    const generadorPdf = (pdfMake as any).default || pdfMake;
    generadorPdf.createPdf(docDefinition).download(nombreArchivo);
  }
}