// src/app/models/maquinaria.model.ts
import { EstadoMaquinaria, EstadoMantenimiento, TipoEventoHorometro } from './types';

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
  codigo?: string;
  numero_serie?: string;
  placa?: string;
  anio_fabricacion?: number;
  estado?: EstadoMaquinaria;
  horometro_inicial?: number;
  horometro_actual?: number;
  intervalo_mantenimiento?: number;
  ultimo_mantenimiento?: number;
  // Campos calculados en frontend, no existen en BD
  horas_desde_mantenimiento?: number;
  horas_restantes?: number;
  porcentaje_progreso?: number;
  estado_mantenimiento?: EstadoMantenimiento;
}

export interface ILecturaHorometro {
  id?: string;
  maquina_id: string;
  horometro: number;
  fecha_lectura: string;
  tipo_evento: TipoEventoHorometro;
  operador?: string;
  observaciones?: string;
  created_at?: string;
}