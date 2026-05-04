import { Injectable } from '@angular/core';
import { ICotizacion } from '../models/cotizacion.model';

import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';

const fuentes: any = pdfFonts;
const vfsReal = fuentes.vfs || fuentes.pdfMake?.vfs || fuentes.default?.pdfMake?.vfs;
Object.assign(pdfMake, { vfs: vfsReal });

@Injectable({ providedIn: 'root' })
export class PdfService {

  // ── Utilidades ───────────────────────────────────────────────────────────

  private async cargarImagenRemota(url: string): Promise<string | null> {
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
    } catch { return null; }
  }

  private formatearTextoLargo(texto: string): string {
    if (!texto) return '';
    return texto.split(' ')
      .map(p => p.length > 25 ? p.match(/.{1,25}/g)?.join('\u200B') : p)
      .join(' ');
  }

  private color(empresa: any): string {
    return empresa?.color || '#01696f';
  }

  // ── Método principal ─────────────────────────────────────────────────────

  async generarYDescargarCotizacion(
    data: ICotizacion,
    datosEmpresa: any,
    lugarEntrega: string = '',
    condiciones: any = {}
  ) {
    if (!datosEmpresa) return;

    const colorEmpresa    = this.color(datosEmpresa);
    const logoConvertido  = await this.cargarImagenRemota(datosEmpresa.ruta_logo);
    const firmaConvertida = await this.cargarImagenRemota(datosEmpresa.ruta_firma);

    // ── Logo ──────────────────────────────────────────────────────────────
    const logoIzquierda = logoConvertido
      ? { image: logoConvertido, width: 90, margin: [0, 0, 0, 0] }
      : {
          text: datosEmpresa.nombre_comercial || 'EMPRESA',
          color: colorEmpresa, fontSize: 13, bold: true, width: 130
        };

    // ── Firma ─────────────────────────────────────────────────────────────
    const bloquesFirma: any[] = [
      firmaConvertida
        ? { image: firmaConvertida, width: 110, alignment: 'center', margin: [0, 0, 0, 4] }
        : { text: ' ', margin: [0, 30, 0, 4] },
      { canvas: [{ type: 'line', x1: 10, y1: 0, x2: 150, y2: 0, lineWidth: 0.8, lineColor: '#9ca3af' }] },
      { text: 'Gerencia General', alignment: 'center', fontSize: 8, color: '#6b7280', margin: [0, 3, 0, 0] },
      { text: datosEmpresa.nombre_comercial || '', alignment: 'center', fontSize: 7, color: '#9ca3af' }
    ];

    // ── Fecha ─────────────────────────────────────────────────────────────
    const fechaFormat = new Date(data.fecha).toLocaleDateString('es-PE', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    // ── Lugar de entrega ──────────────────────────────────────────────────
    const entregaRaw = String(lugarEntrega || (data as any).lugar_entrega || '').toUpperCase().trim();
    let textoEntrega = 'NO ESPECIFICADO';
    if (entregaRaw.includes('CANTERA')) textoEntrega = 'PUESTO EN CANTERA';
    else if (entregaRaw.includes('OBRA')) textoEntrega = 'PUESTO EN OBRA (CON FLETE)';

    // ── FIX #1: era "observaciones" suelto, ahora lee condiciones ────────
    const obsFinal = condiciones.observaciones || (data as any).observaciones || '';
    const vendedor = (data as any).vendedor || '';
    const tieneIgv = Number(data.igv) > 0;

    // ── Tabla de ítems ────────────────────────────────────────────────────
    const anchosTabla = [22, '*', 35, 38, 60, 68];

    const filasItems: any[] = [
      [
        { text: '#',        style: 'thCell' },
        { text: 'Descripción del Producto / Servicio', style: 'thCell' },
        { text: 'Unid.',    style: 'thCell' },
        { text: 'Cant.',    style: 'thCell' },
        { text: 'P. Unit.', style: 'thCell' },
        { text: 'Subtotal', style: 'thCell' }
      ],
      ...data.items.map((item: any, i: number) => [
        { text: (i + 1).toString(), style: 'tdCell', alignment: 'center',
          fillColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' },
        { text: this.formatearTextoLargo(item.descripcion), style: 'tdCell',
          fillColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' },
        { text: item.unidad || '', style: 'tdCell', alignment: 'center',
          fillColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' },
        { text: String(item.cantidad), style: 'tdCell', alignment: 'center',
          fillColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' },
        { text: `S/ ${Number(item.precio_unitario).toFixed(2)}`, style: 'tdCell',
          alignment: 'right', fillColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' },
        { text: `S/ ${Number(item.subtotal).toFixed(2)}`, style: 'tdCell',
          alignment: 'right', bold: true,
          fillColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }
      ])
    ];

    // ── Filas de totales ──────────────────────────────────────────────────
    const filasTotales: any[] = [
      [
        { text: 'Subtotal:', colSpan: 5, alignment: 'right', bold: true, fontSize: 9,
          border: [false, true, false, false], borderColor: ['', '#e5e7eb', '', ''],
          margin: [0, 6, 4, 2] },
        '', '', '', '',
        { text: `S/ ${Number(data.subtotal).toFixed(2)}`, alignment: 'right', fontSize: 9,
          border: [false, true, false, false], borderColor: ['', '#e5e7eb', '', ''],
          margin: [0, 6, 0, 2] }
      ]
    ];

    if (tieneIgv) {
      filasTotales.push([
        { text: 'IGV (18%):', colSpan: 5, alignment: 'right', bold: true, fontSize: 9,
          border: [false, false, false, false], margin: [0, 2, 4, 2], color: '#6b7280' },
        '', '', '', '',
        { text: `S/ ${Number(data.igv).toFixed(2)}`, alignment: 'right', fontSize: 9,
          border: [false, false, false, false], margin: [0, 2, 0, 2], color: '#6b7280' }
      ]);
    }

    filasTotales.push([
      { text: 'TOTAL FINAL:', colSpan: 5, alignment: 'right', bold: true, fontSize: 12,
        border: [false, true, false, false], borderColor: ['', colorEmpresa, '', ''],
        margin: [0, 4, 4, 4], color: colorEmpresa },
      '', '', '', '',
      { text: `S/ ${Number(data.total).toFixed(2)}`, alignment: 'right', bold: true,
        fontSize: 12, color: colorEmpresa,
        border: [false, true, false, false], borderColor: ['', colorEmpresa, '', ''],
        margin: [0, 4, 0, 4] }
    ]);

    // ── FIX #2: columna de cuentas/contacto dinámica ──────────────────────
    const cuentas: any[] = datosEmpresa.cuentas_bancarias || [];
    const mostrarCuentas  = condiciones.mostrarCuentas !== false
                            && datosEmpresa.mostrar_cuentas !== false
                            && cuentas.length > 0;

    const stackPago: any[] = [];

    if (mostrarCuentas) {
      stackPago.push({
        text: 'CUENTAS PARA ABONO', bold: true, fontSize: 7,
        color: colorEmpresa, margin: [0, 0, 0, 4]
      });
      cuentas.forEach((c: any) => {
        stackPago.push({
          text: `• ${c.banco} (${c.tipo}): ${c.numero}`,
          fontSize: 7, margin: [0, 0, 0, 2]
        });
        if (c.cci) {
          stackPago.push({
            text: `  CCI: ${c.cci}`,
            fontSize: 6.5, color: '#6b7280', margin: [0, 0, 0, 2]
          });
        }
      });
    } else if (condiciones.mostrarContacto && datosEmpresa.contacto_aprobacion) {
      stackPago.push({
        text: 'PARA APROBAR ESTA COTIZACIÓN', bold: true, fontSize: 7,
        color: colorEmpresa, margin: [0, 0, 0, 5]
      });
      stackPago.push({
        text: datosEmpresa.contacto_aprobacion,
        fontSize: 7, color: '#374151', italics: true
      });
    } else {
      stackPago.push({
        text: 'Gracias por su preferencia.',
        fontSize: 7, color: '#6b7280', italics: true
      });
    }

    if (condiciones.mostrarValidez !== false) {
      stackPago.push({
        text: `• Válido por ${condiciones.diasValidez || '15'} días calendario`,
        fontSize: 7, color: '#6b7280', margin: [0, 4, 0, 0]
      });
    }

    // ── Bloque condiciones footer ─────────────────────────────────────────
    const bloqueCondiciones = (currentPage: number, pageCount: number): any => {
      if (currentPage !== pageCount) {
        return {
          margin: [40, 8, 40, 0],
          text: `Página ${currentPage} de ${pageCount}`,
          alignment: 'center', fontSize: 7, color: '#9ca3af'
        };
      }

      return {
        margin: [40, 10, 40, 0],
        stack: [
          {
            canvas: [{
              type: 'line', x1: 0, y1: 0, x2: 515, y2: 0,
              lineWidth: 0.5, lineColor: '#e5e7eb'
            }],
            margin: [0, 0, 0, 8]
          },

          {
            columns: [
              {
                width: '65%',
                table: {
                  widths: ['50%', '50%'],
                  body: [
                    [
                      { text: 'CONDICIONES DE ENTREGA', style: 'footerBoxHeader',
                        border: [false, false, false, false],
                        fillColor: '#f9fafb', margin: [6, 4, 6, 4] },
                      { text: 'CONDICIONES DE PAGO', style: 'footerBoxHeader',
                        border: [false, false, false, false],
                        fillColor: '#f9fafb', margin: [6, 4, 6, 4] }
                    ],
                    [
                      {
                        stack: [
                          { text: [{ text: 'Entrega: ', bold: true }, textoEntrega],
                            fontSize: 7, margin: [0, 0, 0, 3] },
                          { text: [{ text: 'Impuestos: ', bold: true },
                            tieneIgv ? 'INCLUYEN IGV (18%)' : 'NO INCLUYEN IGV'],
                            fontSize: 7, margin: [0, 0, 0, 3] },
                          ...(vendedor
                            ? [{ text: [{ text: 'Vendedor: ', bold: true }, vendedor],
                                fontSize: 7, margin: [0, 0, 0, 3] }]
                            : []),
                          ...(obsFinal
                            ? [{ text: [{ text: 'Notas: ', bold: true }, obsFinal],
                                fontSize: 7, margin: [0, 0, 0, 0] }]
                            : [])
                        ],
                        border: [false, false, false, false],
                        margin: [6, 4, 6, 6], color: '#374151'
                      },
                      // ── columna dinámica de pago ──────────────────────
                      {
                        stack: stackPago,
                        border: [false, false, false, false],
                        margin: [6, 4, 6, 6], color: '#374151'
                      }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: (i: number) => i === 1 ? 0.5 : 0,
                  vLineWidth: (i: number) => i === 1 ? 0.5 : 0,
                  hLineColor: () => '#e5e7eb',
                  vLineColor: () => '#e5e7eb',
                }
              },

              {
                width: '35%',
                stack: [
                  { text: ' ', margin: [0, 0, 0, 0] },
                  ...bloquesFirma
                ],
                alignment: 'center',
                margin: [10, 0, 0, 0]
              }
            ]
          },

          {
            text: `Página ${currentPage} de ${pageCount}`,
            alignment: 'center', fontSize: 7, color: '#9ca3af', margin: [0, 6, 0, 0]
          }
        ]
      };
    };

    // ── Documento ─────────────────────────────────────────────────────────
    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 130, 40, 160],

      header: () => ({
        margin: [40, 18, 40, 0],
        stack: [
          {
            columns: [
              logoIzquierda,
              {
                width: '*',
                stack: [
                  { text: `COTIZACIÓN N° ${data.folio}`, fontSize: 14, bold: true,
                    color: colorEmpresa, alignment: 'right' },
                  { text: datosEmpresa.nombre_comercial || '', bold: true,
                    fontSize: 10, alignment: 'right', margin: [0, 2, 0, 0] },
                  ...(datosEmpresa.razon_social
                    ? [{ text: datosEmpresa.razon_social, fontSize: 8,
                        alignment: 'right', color: '#6b7280' }]
                    : []),
                  { text: `RUC: ${datosEmpresa.ruc || '-'}`,
                    alignment: 'right', fontSize: 8, color: '#6b7280' },
                  { text: datosEmpresa.direccion || '',
                    alignment: 'right', fontSize: 7, color: '#9ca3af' },
                  { text: `Tel: ${datosEmpresa.telefonos || '-'}  |  ${datosEmpresa.correo || ''}`,
                    alignment: 'right', fontSize: 7, color: '#9ca3af' },
                  { text: `Fecha: ${fechaFormat}`,
                    alignment: 'right', fontSize: 8, bold: true, margin: [0, 3, 0, 0] }
                ]
              }
            ]
          },
          {
            canvas: [{
              type: 'rect', x: 0, y: 8, w: 515, h: 3,
              color: colorEmpresa, r: 1
            }]
          }
        ]
      }),

      footer: bloqueCondiciones,

      content: [
        // ── Caja cliente ──────────────────────────────────────────────────
        {
          table: {
            widths: ['100%'],
            body: [[{
              columns: [
                {
                  width: '58%',
                  stack: [
                    { text: 'SEÑORES:', fontSize: 7, color: '#9ca3af', margin: [0, 0, 0, 2] },
                    { text: data.cliente_nombre || '—', bold: true, fontSize: 11,
                      color: '#111827', margin: [0, 0, 0, 3] },
                    { text: [{ text: 'RUC / DNI: ', bold: true, fontSize: 8 },
                      { text: data.cliente_documento || '—', fontSize: 8 }] },
                    ...(((data as any).cliente_direccion || (data as any).clienteDireccion)
                      ? [{ text: [{ text: 'Dirección: ', bold: true, fontSize: 8 },
                          { text: (data as any).cliente_direccion || (data as any).clienteDireccion,
                            fontSize: 8 }], margin: [0, 2, 0, 0] }]
                      : [])
                  ]
                },
                {
                  width: '42%',
                  stack: [
                    ...(((data as any).cliente_telefono || (data as any).clienteTelefono)
                      ? [{ text: [{ text: 'Teléfono: ', bold: true, fontSize: 8 },
                          { text: (data as any).cliente_telefono || (data as any).clienteTelefono,
                            fontSize: 8 }], margin: [0, 0, 0, 2] }]
                      : []),
                    ...(((data as any).cliente_correo || (data as any).clienteCorreo)
                      ? [{ text: [{ text: 'Correo: ', bold: true, fontSize: 8 },
                          { text: (data as any).cliente_correo || (data as any).clienteCorreo,
                            fontSize: 8 }] }]
                      : [])
                  ],
                  alignment: 'right'
                }
              ],
              border: [false, false, false, false],
              fillColor: '#f8fafc',
              margin: [12, 10, 12, 10]
            }]]
          },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
          margin: [0, 0, 0, 14]
        },

        // ── Tabla de ítems ────────────────────────────────────────────────
        {
          table: {
            headerRows: 1,
            widths: anchosTabla,
            body: filasItems,
            dontBreakRows: true
          },
          layout: {
            hLineWidth: (i: number, node: any) =>
              (i === 0 || i === 1 || i === node.table.body.length) ? 1.5 : 0.5,
            vLineWidth: () => 0,
            hLineColor: (i: number, node: any) =>
              (i === 0 || i === 1 || i === node.table.body.length)
                ? colorEmpresa : '#e5e7eb',
            paddingTop: () => 5,
            paddingBottom: () => 5,
            paddingLeft: () => 4,
            paddingRight: () => 4
          }
        },

        // ── Totales ───────────────────────────────────────────────────────
        {
          table: { widths: anchosTabla, body: filasTotales },
          layout: 'noBorders',
          margin: [0, 0, 0, 0]
        }
      ],

      styles: {
        thCell: {
          bold: true, fontSize: 9, color: 'white',
          fillColor: colorEmpresa, alignment: 'center',
          margin: [2, 5, 2, 5]
        },
        tdCell: {
          fontSize: 8.5, margin: [2, 4, 2, 4], color: '#1f2937'
        },
        footerBoxHeader: {
          bold: true, fontSize: 7.5, color: colorEmpresa, alignment: 'center'
        }
      }
    };

    // ── Descarga ──────────────────────────────────────────────────────────
    const nombreEmpresa = (datosEmpresa.nombre_comercial || datosEmpresa.id || 'empresa')
      .replace(/\s+/g, '_');
    const nombreCliente = (data.cliente_nombre || 'cliente').replace(/\s+/g, '_');
    const nombreArchivo = `${data.folio}_${nombreEmpresa}_${nombreCliente}.pdf`;

    const generadorPdf = (pdfMake as any).default || pdfMake;
    generadorPdf.createPdf(docDefinition).download(nombreArchivo);
  }
}