export interface ICotizacion {
  id?: string;             // Generado por Supabase
  folio: string;           // Ejemplo: COT-2024-001
  fecha: Date | string;
  empresa: 'W&M' | 'VDC';
  cliente_id?: string;
  cliente_nombre: string;
  cliente_documento: string;
  subtotal: number;
  igv: number;
  total: number;
  estado: 'PENDIENTE' | 'APROBADA' | 'ANULADA';
  items: ICotizacionDetalle[]; // El carrito de compras
}

export interface ICotizacionDetalle {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}