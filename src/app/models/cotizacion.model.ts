// src/app/models/cotizacion.model.ts
import { EstadoCotizacion } from './types';

export interface ICotizacionItem {
  id?: string;
  producto_id?: string;
  codigo_sku?: string;
  descripcion: string;
  unidad?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  igv?: number;
  total?: number;
}

export interface ICotizacion {
  id?: string;
  folio: string;
  fecha?: string;
  empresa_id: string;
  cliente_id?: string;
  cliente_nombre: string;
  cliente_documento: string;
  subtotal: number;
  igv: number;
  total: number;
  estado?: EstadoCotizacion;
  items: ICotizacionItem[];
  vendedor?: string;
  lugar_entrega?: string;
  observaciones?: string;
  cliente_telefono?: string;
  cliente_direccion?: string;
  cliente_correo?: string;
  oculta?: boolean;
}