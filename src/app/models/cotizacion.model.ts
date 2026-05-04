export interface ICotizacion {
  folio: string;
  fecha: string;
  empresa_id: string;
  cliente_nombre: string;
  cliente_documento?: string;
  subtotal: number;
  igv: number;
  total: number;
  estado: string;
  items: any[];
  vendedor?: string;
  lugar_entrega?: string;      
  observaciones?: string;      
}

export interface ICotizacionDetalle {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}