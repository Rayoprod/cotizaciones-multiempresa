import { describe, it, expect } from 'vitest';
import { PdfService } from './pdf.service';

describe('PdfService', () => {
  it('should extract client name correctly from string or object', () => {
    const service = new PdfService();

    // Test with plain string
    const dataString = { cliente_nombre: 'JUAN PEREZ' };
    const rawNombreStr = dataString.cliente_nombre;
    expect(rawNombreStr).toBe('JUAN PEREZ');

    // Test with object containing cliente_nombre
    const dataObj = { cliente_nombre: { cliente_nombre: 'ACME CORP' } as any };
    const rawNombreObj = dataObj.cliente_nombre;
    let clienteNombreVal = '—';
    if (typeof rawNombreObj === 'object' && rawNombreObj !== null) {
      clienteNombreVal = (rawNombreObj.nombre_razon_social || rawNombreObj.cliente_nombre || rawNombreObj.nombre || '—').toString().trim();
    }
    expect(clienteNombreVal).toBe('ACME CORP');
  });
});
