import { describe, it, expect } from 'vitest';
import { extraerNombreClienteTexto, extraerDocumentoClienteTexto } from './cliente.model';

describe('Customer Helper Functions - extraerNombreClienteTexto & extraerDocumentoClienteTexto', () => {
  it('should extract plain string customer names', () => {
    expect(extraerNombreClienteTexto('CONSTRUCTORA SAC')).toBe('CONSTRUCTORA SAC');
    expect(extraerNombreClienteTexto('  ACME CORP  ')).toBe('ACME CORP');
  });

  it('should extract names from objects with various property keys', () => {
    expect(extraerNombreClienteTexto({ nombre_razon_social: 'CORP 1' })).toBe('CORP 1');
    expect(extraerNombreClienteTexto({ cliente_nombre: 'CORP 2' })).toBe('CORP 2');
    expect(extraerNombreClienteTexto({ clientenombre: 'CORP 3' })).toBe('CORP 3');
    expect(extraerNombreClienteTexto({ clienteNombre: 'CORP 4' })).toBe('CORP 4');
    expect(extraerNombreClienteTexto({ nombre: 'CORP 5' })).toBe('CORP 5');
    expect(extraerNombreClienteTexto({ label: 'CORP 6' })).toBe('CORP 6');
  });

  it('should recursively extract names from nested PrimeNG event objects', () => {
    const pEvent1 = { originalEvent: {}, value: { nombre_razon_social: 'NESTED CORP 1' } };
    expect(extraerNombreClienteTexto(pEvent1)).toBe('NESTED CORP 1');

    const pEvent2 = { originalEvent: {}, value: 'NESTED CORP 2' };
    expect(extraerNombreClienteTexto(pEvent2)).toBe('NESTED CORP 2');
  });

  it('should safely handle empty, invalid, and [object Object] inputs', () => {
    expect(extraerNombreClienteTexto('[object Object]')).toBe('');
    expect(extraerNombreClienteTexto({})).toBe('');
    expect(extraerNombreClienteTexto(null)).toBe('');
    expect(extraerNombreClienteTexto(undefined)).toBe('');
  });

  it('should extract customer document text correctly', () => {
    expect(extraerDocumentoClienteTexto('20601234567')).toBe('20601234567');
    expect(extraerDocumentoClienteTexto(20601234567)).toBe('20601234567');
    expect(extraerDocumentoClienteTexto({ documento_identidad: '10456789012' })).toBe('10456789012');
    expect(extraerDocumentoClienteTexto({ originalEvent: {}, value: { ruc: '20111222333' } })).toBe('20111222333');
    expect(extraerDocumentoClienteTexto(null)).toBe('');
  });
});
