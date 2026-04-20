export interface ICotizacion {
  folio: string;
  fecha: string;
  empresa: string;
  cliente_nombre: string;
  cliente_documento?: string;
  subtotal: number;
  igv: number;
  total: number;
  estado: string;
  items: any[];
  
  // ✅ Agrega esta línea:
  vendedor?: string; 
}

export interface ICotizacionDetalle {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}