export interface ICotizacion {
  id?: string;
  folio: string;
  fecha: string;
  empresa_id: string;
  cliente_nombre: string;
  cliente_documento?: string;
  cliente_telefono?: string;
  cliente_direccion?: string;
  cliente_correo?: string;
  subtotal: number;
  igv: number;
  total: number;
  estado: string;
  items: any[];
  vendedor?: string;
  lugar_entrega?: string;
  observaciones?: string;
   oculta?: boolean;
}

export interface ICotizacionDetalle {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}