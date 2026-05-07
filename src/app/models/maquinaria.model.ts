export interface IMaquinaria {
  id?: string;
  empresa_id: string;
  nombre: string;
  descripcion?: string;
  tipo?: string;
  marca?: string;
  modelo?: string;
  precio_hora?: number;
  precio_dia?: number;
  precio_mes?: number;
  precio_venta?: number;
  unidad_medida?: string;
  activa?: boolean;
  created_at?: string;
}

export interface MaquinariaItem {
  id?: string;
  maquinaria_id: string;
  nombre: string;
  tipo?: string;
  cantidad: number;
  modalidad: 'alquiler_hora' | 'alquiler_dia' | 'alquiler_mes' | 'venta';
  precio_unitario: number;
  subtotal: number;
}
