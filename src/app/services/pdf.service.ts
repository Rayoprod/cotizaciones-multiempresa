import { Injectable } from '@angular/core';
import { ICondicionesPdf, ICotizacion } from '../models/cotizacion.model';
import { SupabaseService } from './supabase.service';
import { extraerNombreClienteTexto, extraerDocumentoClienteTexto } from '../models/cliente.model';

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
  cotizacion: Pick<ICotizacion, 'lugar_entrega' | 'incluye_igv' | 'igv' | 'tipo_origen' | 'folio_origen' | 'vendedor' | 'observaciones'>,
  condiciones: ICondicionesPdf
): Array<[string, string]> {
  const lineas: Array<[string, string]> = [];
  const lugar = cotizacion.lugar_entrega?.trim();
  if (lugar) lineas.push(['Lugar de entrega', lugar]);

  const tieneIgv = cotizacion.incluye_igv ?? Number(cotizacion.igv) > 0;
  lineas.push(['Impuestos', tieneIgv ? 'El total incluye IGV (18%)' : 'Los precios NO incluyen IGV']);

  if (condiciones.mostrarValidez) lineas.push(['Validez', `${condiciones.diasValidez} días calendario`]);
  if (cotizacion.tipo_origen === 'revision' && cotizacion.folio_origen) lineas.push(['Reemplaza a', cotizacion.folio_origen]);
  if (cotizacion.vendedor) lineas.push(['Vendedor', cotizacion.vendedor]);
  if (cotizacion.observaciones) lineas.push(['Observaciones', cotizacion.observaciones]);
  return lineas;
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

  // ── Método principal ─────────────────────────────────────────────────────

  async generarYDescargarCotizacion(
    data: ICotizacion,
    datosEmpresa: any,
    ajustes: Partial<ICondicionesPdf> = {}
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

    const tieneIgv = data.incluye_igv ?? Number(data.igv) > 0;

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

    bloqueTotales.push({
      columns: [
        { width: '*', text: '' },
        {
          width: 200,
          table: {
            widths: ['*', 'auto'],
            body: [
              [
                { text: 'Subtotal', fontSize: 9, color: '#374151', border: [false, false, false, false], margin: [0, 4, 0, 4] },
                { text: `S/ ${this.formatNumber(data.subtotal)}`, fontSize: 9, alignment: 'right', border: [false, false, false, false], margin: [0, 4, 0, 4] }
              ],
              ...(tieneIgv ? [[
                { text: 'IGV (18%)', fontSize: 9, color: '#6b7280', border: [false, false, false, false], margin: [0, 2, 0, 2] },
                { text: `S/ ${this.formatNumber(data.igv)}`, fontSize: 9, color: '#6b7280', alignment: 'right', border: [false, false, false, false], margin: [0, 2, 0, 2] }
              ]] : []),
              [
                { text: 'TOTAL', fontSize: 13, bold: true, color: colorEmpresa, border: [false, true, false, false], borderColor: [colorEmpresa, colorEmpresa, colorEmpresa, colorEmpresa], margin: [0, 6, 0, 4] },
                { text: `S/ ${this.formatNumber(data.total)}`, fontSize: 13, bold: true, color: colorEmpresa, alignment: 'right', border: [false, true, false, false], borderColor: [colorEmpresa, colorEmpresa, colorEmpresa, colorEmpresa], margin: [0, 6, 0, 4] }
              ]
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
    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 125, 40, 40],
      header: headerFn,
      footer: footerFn,

      content: [
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
    const nombreArchivo = `${data.folio}_${nombreEmpresa}_${nombreCliente}.pdf`;

    const generadorPdf = await pdfMake;
    generadorPdf.createPdf(docDefinition).download(nombreArchivo);
  }
}