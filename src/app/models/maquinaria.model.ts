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

  // Campos de mantenimiento (desde BD)
  codigo?: string;
  numero_serie?: string;
  placa?: string;
  anio_fabricacion?: number;
  estado?: 'operativa' | 'mantenimiento' | 'baja';
  horometro_inicial?: number;
  horometro_actual?: number;
  intervalo_mantenimiento?: number;
  ultimo_mantenimiento?: number; // horómetro al último mantenimiento

  // Campos calculados en el frontend
  horas_desde_mantenimiento?: number;
  horas_restantes?: number;
  porcentaje_progreso?: number;   // 0-100+ (100 = justo en el límite)
  estado_mantenimiento?: 'al_dia' | 'proximo' | 'vencido';
}

export interface LecturaHorometro {
  id?: string;
  maquina_id: string;
  horometro: number;
  fecha_lectura: string;  // 'YYYY-MM-DD'
  tipo_evento: 'lectura' | 'mantenimiento' | 'reparacion';
  operador?: string;
  observaciones?: string;
}