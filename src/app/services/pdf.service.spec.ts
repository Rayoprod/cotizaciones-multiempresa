import { describe, it, expect } from 'vitest';
import { condicionesPdf } from './pdf.service';

describe('condicionesPdf', () => {
  it('sin condiciones guardadas usa los valores por defecto de la empresa', () => {
    expect(condicionesPdf({ condiciones: {} }, { mostrar_cuentas: true })).toEqual({
      mostrarValidez: true, diasValidez: 15, mostrarCuentas: true, mostrarContacto: false
    });
    // Si la empresa no muestra cuentas, por defecto se muestra el contacto.
    expect(condicionesPdf({}, { mostrar_cuentas: false })).toEqual({
      mostrarValidez: true, diasValidez: 15, mostrarCuentas: false, mostrarContacto: true
    });
  });

  it('respeta las condiciones con las que se guardó la cotización', () => {
    const guardadas = { mostrarValidez: true, diasValidez: 30, mostrarCuentas: false, mostrarContacto: true };
    expect(condicionesPdf({ condiciones: guardadas }, { mostrar_cuentas: true })).toEqual(guardadas);
  });

  it('los ajustes explícitos ganan sobre lo guardado', () => {
    expect(condicionesPdf({ condiciones: { mostrarValidez: true } }, null, { mostrarValidez: false }).mostrarValidez).toBe(false);
  });
});
