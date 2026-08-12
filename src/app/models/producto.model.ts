// src/app/models/producto.model.ts

export interface IProducto {
  id?: string;
  codigo_sku: string;
  descripcion: string;
  unidad?: string;
  precio_unitario_base: number;
  created_at?: string;
  empresa_id: string;
}