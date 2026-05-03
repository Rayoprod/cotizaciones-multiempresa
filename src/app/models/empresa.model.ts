export interface IEmpresa {
  id: string;
  nombre_comercial: string;
  razon_social: string | null;
  ruc: string;
  color: string;
  direccion: string | null;
  telefonos: string | null;
  correo: string | null;
  ruta_logo: string | null;
  ruta_firma: string | null;
  icono: string | null;
  bg_class: string | null;
  text_class: string | null;
  border_hover: string | null;
}