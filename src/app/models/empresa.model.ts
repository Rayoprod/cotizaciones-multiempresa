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
  // ── Nuevas columnas ───────────────────────
  activa: boolean;
  cuentas_bancarias: ICuentaBancaria[];
  contacto_aprobacion?: string;
  mostrar_cuentas: boolean;
}

export interface ICuentaBancaria {
  banco: string;
  tipo: string;
  numero: string;
  cci?: string;
}