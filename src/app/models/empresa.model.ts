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
  activa: boolean;
  cuentas_bancarias: ICuentaBancaria[];
  contacto_aprobacion?: string;
  mostrar_cuentas: boolean;
  prefijo?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
  usuario_creacion?: string;
  usuario_actualizacion?: string;
}

export interface ICuentaBancaria {
  banco: string;
  tipo_cuenta: string;
  numero: string;
  cci?: string;
  moneda?: string;
  activa?: boolean;
  orden?: number;
  titular?: string;
}

export interface EmpresaFormData {
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
  activa: boolean;
  cuentas_bancarias: ICuentaBancaria[];
  contacto_aprobacion?: string;
  mostrar_cuentas: boolean;
  prefijo?: string;
}

export interface EmpresaValidationError {
  campo: string;
  mensaje: string;
  severidad: 'error' | 'warning' | 'info';
}

export interface EmpresaFormState {
  esEdicion: boolean;
  enviando: boolean;
  guardadoAutomaticamente: boolean;
  ultimoGuardado?: Date;
  errores: EmpresaValidationError[];
  cambiosPendientes: boolean;
}