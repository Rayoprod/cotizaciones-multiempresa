/** profiles.rol: 'admin' es el superadmin; el resto de cuentas son 'usuario'. */
export type RolGlobal = 'admin' | 'usuario';
/** usuario_empresa.rol: lo que la cuenta puede hacer en cada empresa. */
export type RolEmpresa = 'admin' | 'vendedor' | 'encargado';
export type EstadoCotizacion = 'BORRADOR' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ANULADA';
export type Moneda = 'PEN' | 'USD' | 'EUR';
/**
 * Cómo se tratan los precios de una cotización:
 * - sumar: se escriben sin IGV y se suma el 18% al total.
 * - incluido: ya traen el IGV; el total es la suma de los ítems.
 * - sin_igv: no se cobra IGV.
 */
export type ModoIgv = 'sumar' | 'incluido' | 'sin_igv';
