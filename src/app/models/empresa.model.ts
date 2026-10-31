// src/app/models/empresa.model.ts
import { ModoIgv, Moneda, RolEmpresa } from './types';

export interface IEmpresa {
  id: string;
  nombre_comercial: string;
  razon_social?: string;
  ruc: string;
  color: string;
  direccion?: string;
  telefonos?: string;
  correo?: string;
  ruta_logo?: string;
  ruta_firma?: string;
  icono?: string;
  bg_class?: string;
  text_class?: string;
  border_hover?: string;
  activa?: boolean;
  contacto_aprobacion?: string;
  mostrar_cuentas?: boolean;
  prefijo?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
  usuario_creacion?: string;
  usuario_actualizacion?: string;
  /** Opciones de "lugar de entrega" de esta empresa; vacía = no se usa. */
  lugares_entrega?: string[];
  /** Modo de IGV con el que abre una cotización nueva de esta empresa. */
  modo_igv?: ModoIgv;
  /** Lo que esta empresa tiene activado; lo decide el administrador general. */
  modulos?: string[];
  /** Con cuántos m³ abre una salida de un volquete del que no se sabe la capacidad. */
  capacidad_volquete_m3?: number;
  // Relación cargada por separado desde tabla cuentas_bancarias
  cuentas_bancarias?: ICuentaBancaria[];
  /** Rol del usuario actual en esta empresa (no es columna: viene de usuario_empresa). */
  mi_rol?: RolEmpresa;
}

export interface ICuentaBancaria {
  id?: string;
  empresa_id?: string;
  banco: string;
  tipo_cuenta: string;
  moneda: Moneda;
  numero: string;
  cci?: string;
  titular?: string;
  activa?: boolean;
  orden?: number;
  created_at?: string;
}

// ── Tipos para el formulario de empresa ──────────────────────

export interface EmpresaFormData {
  id: string;
  nombre_comercial: string;
  razon_social?: string;
  ruc?: string;
  color: string;
  direccion?: string;
  telefonos?: string;
  correo?: string;
  ruta_logo?: string;
  ruta_firma?: string;
  activa?: boolean;
  cuentas_bancarias: ICuentaBancaria[];
  contacto_aprobacion?: string;
  mostrar_cuentas?: boolean;
  prefijo?: string;
  modulos?: string[];
  capacidad_volquete_m3?: number;
}

export interface EmpresaValidationError {
  campo: string;
  mensaje: string;
  severidad: 'error' | 'warning' | 'info';
}

export interface EmpresaFormState {
  cargando: boolean;
  guardando: boolean;
  errores: EmpresaValidationError[];
  dirty: boolean;
}