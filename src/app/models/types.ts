export type RolGlobal = 'admin' | 'admin_empresa' | 'vendedor' | 'solo_lectura';
export type RolEmpresa = 'admin' | 'vendedor' | 'solo_lectura';
export type EstadoCotizacion = 'BORRADOR' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ANULADA';
export type EstadoMaquinaria = 'operativa' | 'mantenimiento' | 'baja';
export type TipoEventoHorometro = 'lectura' | 'mantenimiento' | 'reparacion';
export type EstadoMantenimiento = 'al_dia' | 'proximo' | 'vencido';
export type Moneda = 'PEN' | 'USD' | 'EUR';