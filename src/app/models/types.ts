/** profiles.rol: 'admin' es el superadmin; el resto de cuentas son 'usuario'. */
export type RolGlobal = 'admin' | 'usuario';
/** usuario_empresa.rol: lo que la cuenta puede hacer en cada empresa. */
export type RolEmpresa = 'admin' | 'vendedor';
export type EstadoCotizacion = 'BORRADOR' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ANULADA';
export type Moneda = 'PEN' | 'USD' | 'EUR';
