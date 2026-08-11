import { describe, it, expect } from 'vitest';
import { ClientesComponent } from './clientes';

describe('ClientesComponent - Client creation logic', () => {
  it('should initialize empty client without id property when abrirNuevo is called', () => {
    const mockSession = { empresaActiva: () => ({ id: 'emp-123', nombre: 'Empresa Test' }) };
    const mockMessage = { add: () => {} };
    const comp = new ClientesComponent({} as any, {} as any, mockSession as any, {} as any, mockMessage as any);

    comp.clientes = [];
    comp.abrirNuevo();

    expect(comp.clienteActual.empresa_id).toBe('emp-123');
    expect(comp.clienteActual.id).toBeUndefined();
    expect(comp.clienteDialog).toBe(true);
  });
});
