export interface ICliente {
  id?: string;
  documento_identidad: string;
  nombre_razon_social: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
}