import { describe, it, expect } from 'vitest';
import { etiquetasDeAcceso } from './usuarios';

const nombres = new Map([['VDC', 'VDC'], ['WM', 'W&M'], ['RAYO', 'Rayo']]);

describe('etiquetasDeAcceso', () => {
  it('el superadmin entra a todas, sin importar sus asignaciones', () => {
    expect(etiquetasDeAcceso({ rol: 'admin' }, [{ empresa_id: 'WM', rol: 'vendedor' }], nombres))
      .toEqual([{ texto: 'Superadmin · todas las empresas', severidad: 'danger' }]);
  });

  it('un usuario muestra su rol en cada empresa, por nombre', () => {
    expect(etiquetasDeAcceso({ rol: 'usuario' }, [
      { empresa_id: 'WM', rol: 'vendedor' },
      { empresa_id: 'VDC', rol: 'admin' }
    ], nombres)).toEqual([
      { texto: 'VDC · Admin', severidad: 'warning' },
      { texto: 'W&M · Vendedor', severidad: 'info' }
    ]);
  });

  it('el encargado se distingue de quien trabaja en oficina', () => {
    expect(etiquetasDeAcceso({ rol: 'usuario' }, [{ empresa_id: 'VDC', rol: 'encargado' }], nombres))
      .toEqual([{ texto: 'VDC · Encargado', severidad: 'secondary' }]);
  });

  it('avisa cuando un usuario no tiene empresas', () => {
    expect(etiquetasDeAcceso({ rol: 'usuario' }, [], nombres))
      .toEqual([{ texto: 'Sin empresas', severidad: 'secondary' }]);
  });
});
