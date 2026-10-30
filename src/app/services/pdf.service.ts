import { Injectable } from '@angular/core';
import { ICondicionesPdf, ICotizacion } from '../models/cotizacion.model';
import { SupabaseService } from './supabase.service';
import { extraerNombreClienteTexto, extraerDocumentoClienteTexto } from '../models/cliente.model';
import { modoIgvDe } from '../models/cotizacion.model';
import { ModoIgv } from '../models/types';

const AVISO_IMPUESTOS: Record<ModoIgv, string> = {
  sumar: 'El total incluye IGV (18%)',
  incluido: 'Los precios incluyen IGV (18%)',
  sin_igv: 'Los precios NO incluyen IGV'
};

/**
 * Condiciones con las que se imprime una cotización: las que se guardaron con
 * ella, completadas con los valores por defecto de la empresa (cotizaciones
 * anteriores a que se guardaran) y con los ajustes explícitos del llamador.
 */
export function condicionesPdf(
  cotizacion: Pick<ICotizacion, 'condiciones'>,
  empresa: { mostrar_cuentas?: boolean | null } | null | undefined,
  ajustes: Partial<ICondicionesPdf> = {}
): ICondicionesPdf {
  const cuentasEmpresa = empresa?.mostrar_cuentas ?? true;
  return {
    mostrarValidez: true,
    diasValidez: 15,
    mostrarCuentas: cuentasEmpresa,
    mostrarContacto: !cuentasEmpresa,
    ...(cotizacion.condiciones ?? {}),
    ...ajustes
  };
}

/**
 * Líneas "• Etiqueta: valor" de la caja de condiciones comerciales, en orden.
 * El lugar de entrega es el texto que se guardó con la cotización y solo
 * aparece si la empresa usa lugares de entrega.
 */
export function lineasCondicionesComerciales(
  cotizacion: Pick<ICotizacion, 'lugar_entrega' | 'incluye_igv' | 'precios_con_igv' | 'igv' | 'tipo_origen' | 'folio_origen' | 'vendedor_nombre' | 'observaciones'>,
  condiciones: ICondicionesPdf
): Array<[string, string]> {
  const lineas: Array<[string, string]> = [];
  const lugar = cotizacion.lugar_entrega?.trim();
  if (lugar) lineas.push(['Lugar de entrega', lugar]);

  lineas.push(['Impuestos', AVISO_IMPUESTOS[modoIgvDe(cotizacion)]]);

  if (condiciones.mostrarValidez) lineas.push(['Validez', `${condiciones.diasValidez} días calendario`]);
  if (cotizacion.tipo_origen === 'revision' && cotizacion.folio_origen) lineas.push(['Reemplaza a', cotizacion.folio_origen]);
  if (cotizacion.vendedor_nombre) lineas.push(['Vendedor', cotizacion.vendedor_nombre]);
  if (cotizacion.observaciones) lineas.push(['Observaciones', cotizacion.observaciones]);
  return lineas;
}

/**
 * Filas de los totales del PDF: las que van antes de TOTAL y, si los precios ya
 * traen IGV, la que va después con lo que el total lleva dentro.
 */
export function lineasTotales(
  cotizacion: Pick<ICotizacion, 'subtotal' | 'descuento_global' | 'igv' | 'incluye_igv' | 'precios_con_igv'>
): { antes: Array<[string, number]>; despues: [string, number] | null } {
  const modo = modoIgvDe(cotizacion);
  const descuento = Number(cotizacion.descuento_global) || 0;
  const antes: Array<[string, number]> = [];
  if (modo !== 'incluido' || descuento > 0) antes.push(['Subtotal', cotizacion.subtotal]);
  if (descuento > 0) antes.push(['Descuento', -descuento]);
  if (modo === 'sumar') antes.push(['IGV (18%)', cotizacion.igv]);
  return { antes, despues: modo === 'incluido' ? ['Incluye IGV (18%):', cotizacion.igv] : null };
}

/** Aviso al inicio del PDF de una cotización anulada. */
export function avisoAnulada(
  cotizacion: Pick<ICotizacion, 'estado'>,
  reemplazadaPor?: string | null
): string | null {
  if (cotizacion.estado !== 'ANULADA') return null;
  return reemplazadaPor ? `COTIZACIÓN ANULADA · Reemplazada por ${reemplazadaPor}` : 'COTIZACIÓN ANULADA';
}

@Injectable({ providedIn: 'root' })
export class PdfService {

  private pdfMakeInstance: any = null;
  /** Logos y firmas ya descargados, por URL: el siguiente PDF no los vuelve a pedir. */
  private imagenes = new Map<string, Promise<string | null>>();

  constructor(private supabase: SupabaseService) {}

  private async getPdfMake(): Promise<any> {
    if (this.pdfMakeInstance) {
      return this.pdfMakeInstance;
    }
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');

    const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
    const pdfFonts: any = (pdfFontsModule as any).default || pdfFontsModule;
    const vfsReal = pdfFonts.vfs || pdfFonts.pdfMake?.vfs || pdfFonts.default?.pdfMake?.vfs;

    if (vfsReal) {
      Object.assign(pdfMake, { vfs: vfsReal });
    }
    this.pdfMakeInstance = pdfMake;
    return this.pdfMakeInstance;
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  private cargarImagen(url: string): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    if (url.startsWith('data:')) return Promise.resolve(url);
    if (!this.imagenes.has(url)) {
      this.imagenes.set(url, this.descargarImagen(url).then(imagen => {
        if (!imagen) this.imagenes.delete(url);
        return imagen;
      }));
    }
    return this.imagenes.get(url)!;
  }

  private async descargarImagen(url: string): Promise<string | null> {
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
      .map(p => p.length > 30 ? p.match(/.{1,30}/g)?.join('\u200B') : p)
      .join(' ');
  }

  private color(empresa: any): string {
    return empresa?.color || '#01696f';
  }

  /**
   * Formatea un número con separadores de miles y dos decimales fijos.
   * Ejemplo: 19575 -> "19,575.00"
   */
  private formatNumber(value: number): string {
    if (value == null || isNaN(value)) return '0.00';
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatSoles(value: number): string {
    return value < 0 ? `- S/ ${this.formatNumber(-value)}` : `S/ ${this.formatNumber(value)}`;
  }

  // ── Método principal ─────────────────────────────────────────────────────

  async generarYDescargarCotizacion(
    data: ICotizacion,
    datosEmpresa: any,
    ajustes: Partial<ICondicionesPdf> = {},
    reemplazadaPor: string | null = null
  ) {
    if (!datosEmpresa) return;
    const condiciones = condicionesPdf(data, datosEmpresa, ajustes);

    // Todo en paralelo: cada pedido tarda cientos de ms. Las cuentas se piden
    // frescas porque son los datos de pago que verá el cliente.
    const pdfMake = this.getPdfMake();
    const [cuentasFrescas, logoConvertido, firmaConvertida] = await Promise.all([
      datosEmpresa.id
        ? this.supabase.getCuentasBancarias(datosEmpresa.id).catch(() => datosEmpresa.cuentas_bancarias ?? [])
        : Promise.resolve(datosEmpresa.cuentas_bancarias ?? []),
      this.cargarImagen(datosEmpresa.ruta_logo),
      this.cargarImagen(datosEmpresa.ruta_firma)
    ]);
    datosEmpresa = { ...datosEmpresa, cuentas_bancarias: cuentasFrescas };

    const colorEmpresa = this.color(datosEmpresa);

    // ── Datos comunes ─────────────────────────────────────────────────────
    const fechaRaw = data.fecha;
    let fechaObj: Date;
    if ((fechaRaw as any) instanceof Date) {
      fechaObj = fechaRaw as any;
    } else if (typeof fechaRaw === 'string' && fechaRaw.includes('T')) {
      fechaObj = new Date(fechaRaw);
    } else if (typeof fechaRaw === 'string' && fechaRaw.includes('-')) {
      fechaObj = new Date(fechaRaw.replace(/-/g, '/'));
    } else {
      fechaObj = new Date();
    }
    const fechaFormat = fechaObj.toLocaleDateString('es-PE', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    // ── Header ─────────────────────────────────────────────────────────────
    const headerFn = () => {
      const logoBlock = logoConvertido
        ? { image: logoConvertido, width: 75, margin: [0, 0, 0, 0] }
        : { text: datosEmpresa.nombre_comercial || 'EMPRESA', color: colorEmpresa, fontSize: 18, bold: true, width: 180 };

      return {
        margin: [40, 20, 40, 0],
        stack: [
          {
            columns: [
              logoBlock,
              {
                width: '*',
                stack: [
                  { text: `COTIZACIÓN`, fontSize: 10, color: '#6b7280', alignment: 'right', margin: [0, 0, 0, 1] },
                  { text: data.folio, fontSize: 16, bold: true, color: colorEmpresa, alignment: 'right' },
                  {
                    text: datosEmpresa.razon_social || datosEmpresa.nombre_comercial,
                    fontSize: 9, color: '#374151', alignment: 'right', margin: [0, 4, 0, 0]
                  },
                  { text: `RUC: ${datosEmpresa.ruc || '-'}`, fontSize: 9, color: '#6b7280', alignment: 'right' },
                  ...(datosEmpresa.direccion ? [{
                    stack: datosEmpresa.direccion
                      .replace(/\\n/g, '\n')   // convierte "\n" literal en salto real
                      .split('\n')
                      .filter((linea: string) => linea.trim() !== '')  // elimina líneas vacías
                      .map((linea: string) => ({
                        text: linea.trim(),
                        fontSize: 7.5,
                        color: '#9ca3af',
                        alignment: 'right',
                        margin: [0, 0, 0, 1]
                      })),
                    margin: [0, 2, 0, 0]
                  }] : []), {
                    text: [
                      datosEmpresa.telefonos ? `Tel: ${datosEmpresa.telefonos}` : '',
                      datosEmpresa.telefonos && datosEmpresa.correo ? '  •  ' : '',
                      datosEmpresa.correo || ''
                    ].join(''),
                    fontSize: 7.5, color: '#9ca3af', alignment: 'right'
                  }
                ]
              }
            ]
          },
          { canvas: [{ type: 'rect', x: 0, y: 10, w: 515, h: 2.5, color: colorEmpresa, r: 1 }] }
        ]
      };
    };

    // ── Footer (solo paginación) ──────────────────────────────────────────
    const footerFn = (currentPage: number, pageCount: number): any => ({
      margin: [40, 0, 40, 15],
      columns: [
        {
          text: `${datosEmpresa.nombre_comercial || ''} • ${datosEmpresa.ruc || ''}`,
          fontSize: 7, color: '#9ca3af'
        },
        {
          text: `Página ${currentPage} de ${pageCount}`,
          fontSize: 7, color: '#9ca3af', alignment: 'right'
        }
      ]
    });

    // ── Tabla de ítems ────────────────────────────────────────────────────
    const anchosTabla = [24, '*', 38, 38, 62, 70];

    const filasItems: any[] = [
      [
        { text: '#', style: 'thCell' },
        { text: 'DESCRIPCIÓN', style: 'thCell', alignment: 'left' },
        { text: 'UND', style: 'thCell' },
        { text: 'CANT', style: 'thCell' },
        { text: 'P. UNIT', style: 'thCell' },
        { text: 'IMPORTE', style: 'thCell' }
      ],
      ...data.items.map((item: any, i: number) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
        return [
          { text: (i + 1).toString(), style: 'tdCell', alignment: 'center', fillColor: bg },
          { text: this.formatearTextoLargo(item.descripcion), style: 'tdCell', fillColor: bg },
          { text: item.unidad || '-', style: 'tdCell', alignment: 'center', fillColor: bg },
          { text: String(item.cantidad), style: 'tdCell', alignment: 'center', fillColor: bg },
          { text: `S/ ${this.formatNumber(item.precio_unitario)}`, style: 'tdCell', alignment: 'right', fillColor: bg },
          { text: `S/ ${this.formatNumber(item.subtotal)}`, style: 'tdCell', alignment: 'right', bold: true, fillColor: bg }
        ];
      })
    ];

    // ── Bloque de totales (inline en content, no en footer) ──────────────
    const bloqueTotales: any[] = [];
    const totales = lineasTotales(data);
    const sinBorde = [false, false, false, false];

    bloqueTotales.push({
      columns: [
        { width: '*', text: '' },
        {
          width: 200,
          table: {
            widths: ['*', 'auto'],
            body: [
              ...totales.antes.map(([etiqueta, monto]) => {
                const color = monto < 0 ? '#b91c1c' : etiqueta === 'Subtotal' ? '#374151' : '#6b7280';
                const margen = etiqueta === 'Subtotal' ? [0, 4, 0, 4] : [0, 2, 0, 2];
                return [
                  { text: etiqueta, fontSize: 9, color, border: sinBorde, margin: margen },
                  { text: this.formatSoles(monto), fontSize: 9, color, alignment: 'right', border: sinBorde, margin: margen }
                ];
              }),
              [
                { text: 'TOTAL', fontSize: 13, bold: true, color: colorEmpresa, border: [false, true, false, false], borderColor: [colorEmpresa, colorEmpresa, colorEmpresa, colorEmpresa], margin: [0, 6, 0, 4] },
                { text: `S/ ${this.formatNumber(data.total)}`, fontSize: 13, bold: true, color: colorEmpresa, alignment: 'right', border: [false, true, false, false], borderColor: [colorEmpresa, colorEmpresa, colorEmpresa, colorEmpresa], margin: [0, 6, 0, 4] }
              ],
              ...(totales.despues ? [[
                { text: totales.despues[0], fontSize: 9, color: '#6b7280', border: sinBorde, margin: [0, 0, 0, 2] },
                { text: this.formatSoles(totales.despues[1]), fontSize: 9, color: '#6b7280', alignment: 'right', border: sinBorde, margin: [0, 0, 0, 2] }
              ]] : [])
            ]
          },
          layout: { hLineWidth: (i: number) => i === 0 ? 0 : 0.5, vLineWidth: () => 0, hLineColor: () => '#e5e7eb' }
        }
      ],
      margin: [0, 8, 0, 0]
    });

    // ── Bloque condiciones (DENTRO del content, nunca en footer) ─────────
    const cuentas: any[] = datosEmpresa.cuentas_bancarias || [];
    const mostrarCuentas = condiciones.mostrarCuentas
      && datosEmpresa.mostrar_cuentas !== false
      && cuentas.length > 0;
    const mostrarContacto = condiciones.mostrarContacto && !!datosEmpresa.contacto_aprobacion;

    // Columna izquierda: condiciones de entrega/impuestos
    const colCondiciones: any[] = [
      { text: 'CONDICIONES COMERCIALES', fontSize: 8, bold: true, color: colorEmpresa, margin: [0, 0, 0, 6] },
      ...lineasCondicionesComerciales(data, condiciones).map(([etiqueta, valor]) => (
        { text: [{ text: `• ${etiqueta}: `, bold: true, fontSize: 7.5 }, { text: valor, fontSize: 7.5 }], margin: [0, 0, 0, 3] }
      ))
    ];

    // Columna derecha: cuentas bancarias o contacto
    const colPago: any[] = [];

    if (mostrarCuentas) {
      colPago.push({ text: 'DATOS PARA PAGO', fontSize: 8, bold: true, color: colorEmpresa, margin: [0, 0, 0, 6] });
      cuentas.forEach((c: any) => {
        colPago.push({
          text: `• ${c.banco} (${c.tipo_cuenta || c.tipo || 'Corriente'})`,
          fontSize: 7.5, bold: true, margin: [0, 0, 0, 1]
        });
        colPago.push({
          text: `  Nro: ${c.numero}`,
          fontSize: 7, color: '#374151', margin: [0, 0, 0, 1]
        });
        if (c.cci) {
          colPago.push({ text: `  CCI: ${c.cci}`, fontSize: 6.5, color: '#6b7280', margin: [0, 0, 0, 4] });
        } else {
          colPago.push({ text: '', margin: [0, 0, 0, 3] });
        }
      });
    }
    if (mostrarContacto) {
      colPago.push({ text: 'CONTACTO DE APROBACIÓN', fontSize: 8, bold: true, color: colorEmpresa, margin: [0, mostrarCuentas ? 6 : 0, 0, 6] });
      colPago.push({ text: datosEmpresa.contacto_aprobacion, fontSize: 7.5, italics: true, color: '#374151' });
    }

    // Caja de condiciones
    const conColumnaPago = colPago.length > 0;
    const bloqueCondicionesContent: any = {
      margin: [0, 20, 0, 0],
      unbreakable: true,
      table: {
        widths: conColumnaPago ? ['55%', '45%'] : ['100%'],
        body: [
          conColumnaPago
            ? [
              { stack: colCondiciones, border: [false, false, false, false], margin: [10, 10, 10, 10] },
              { stack: colPago, border: [false, false, false, false], margin: [10, 10, 10, 10] }
            ]
            : [
              { stack: colCondiciones, border: [false, false, false, false], margin: [10, 10, 10, 10] }
            ]
        ]
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: (i: number, node: any) => i === 0 || i === node.table.widths.length ? 0.5 : 0.3,
        hLineColor: () => '#e5e7eb',
        vLineColor: () => '#e5e7eb',
        fillColor: () => '#fafbfc'
      }
    };

    // ── Bloque firma ────────────────────────────────────────────────────
    const bloqueFirma: any = firmaConvertida ? {
      margin: [0, 24, 0, 0],
      unbreakable: true,
      columns: [
        { width: '*', text: '' },
        {
          width: 180,
          stack: [
            { image: firmaConvertida, width: 110, alignment: 'center', margin: [0, 0, 0, 0] }
          ],
          alignment: 'center'
        }
      ]
    } : { text: '', margin: [0, 0, 0, 0] };

    // ── Datos del cliente (tal como se guardaron en la cotización) ────────
    const clienteNombreVal = extraerNombreClienteTexto(data.cliente_nombre) || '—';
    const clienteDocVal = extraerDocumentoClienteTexto(data.cliente_documento) || '—';
    const clienteDirVal = data.cliente_direccion || '';
    const clienteTelVal = data.cliente_telefono || '';
    const clienteCorreoVal = data.cliente_correo || '';

    // ── Caja del cliente (fecha incluida) ────────────────────────────────
    const cajaCliente: any = {
      margin: [0, 0, 0, 16],
      table: {
        widths: ['100%'],
        body: [[{
          columns: [
            {
              width: '60%',
              stack: [
                { text: 'SEÑOR(ES):', fontSize: 7, color: '#9ca3af', margin: [0, 0, 0, 3] },
                { text: clienteNombreVal, bold: true, fontSize: 11, color: '#111827', margin: [0, 0, 0, 4] },
                { text: [{ text: 'RUC / DNI: ', bold: true, fontSize: 8.5 }, { text: clienteDocVal, fontSize: 8.5 }], margin: [0, 0, 0, 2] },
                ...(clienteDirVal
                  ? [{ text: [{ text: 'Dirección: ', bold: true, fontSize: 8 }, { text: clienteDirVal, fontSize: 8 }], margin: [0, 2, 0, 0] }]
                  : [])
              ]
            },
            {
              width: '40%',
              stack: [
                { text: [{ text: 'Fecha: ', bold: true, fontSize: 8.5 }, { text: fechaFormat, fontSize: 8.5 }], alignment: 'right', margin: [0, 0, 0, 3] },
                ...(clienteTelVal
                  ? [{ text: [{ text: 'Teléfono: ', bold: true, fontSize: 8 }, { text: clienteTelVal, fontSize: 8 }], alignment: 'right', margin: [0, 0, 0, 2] }]
                  : []),
                ...(clienteCorreoVal
                  ? [{ text: [{ text: 'Correo: ', bold: true, fontSize: 8 }, { text: clienteCorreoVal, fontSize: 8 }], alignment: 'right' }]
                  : [])
              ]
            }
          ],
          border: [true, true, true, true],
          borderColor: ['#e5e7eb', '#e5e7eb', '#e5e7eb', '#e5e7eb'],
          fillColor: '#f8fafc',
          margin: [12, 10, 12, 10]
        }]]
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#e5e7eb',
        vLineColor: () => '#e5e7eb'
      }
    };

    // ── Documento completo ───────────────────────────────────────────────
    const aviso = avisoAnulada(data, reemplazadaPor);
    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 125, 40, 40],
      header: headerFn,
      footer: footerFn,
      ...(aviso ? { watermark: { text: 'ANULADA', color: '#dc2626', opacity: 0.14, bold: true } } : {}),

      content: [
        ...(aviso ? [{ text: aviso, fontSize: 10, bold: true, color: '#b91c1c', alignment: 'center', margin: [0, 0, 0, 10] }] : []),
        cajaCliente,
        {
          table: {
            headerRows: 1,
            widths: anchosTabla,
            body: filasItems,
            dontBreakRows: true
          },
          layout: {
            hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1.2 : 0.4,
            vLineWidth: () => 0,
            hLineColor: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? colorEmpresa : '#e5e7eb',
            paddingTop: () => 5,
            paddingBottom: () => 5,
            paddingLeft: () => 4,
            paddingRight: () => 4
          }
        },
        ...bloqueTotales,
        bloqueCondicionesContent,
        bloqueFirma
      ],

      styles: {
        thCell: {
          bold: true, fontSize: 8.5, color: 'white',
          fillColor: colorEmpresa, alignment: 'center',
          margin: [2, 6, 2, 6]
        },
        tdCell: {
          fontSize: 8, margin: [2, 4, 2, 4], color: '#1f2937'
        }
      }
    };

    // ── Descarga ──────────────────────────────────────────────────────────
    const nombreEmpresa = (datosEmpresa.nombre_comercial || datosEmpresa.id || 'empresa')
      .replace(/\s+/g, '_');
    const nombreCliente = clienteNombreVal.replace(/\s+/g, '_');
    const nombreArchivo = `${data.folio}${aviso ? '_ANULADA' : ''}_${nombreEmpresa}_${nombreCliente}.pdf`;

    const generadorPdf = await pdfMake;
    generadorPdf.createPdf(docDefinition).download(nombreArchivo);
  }
}