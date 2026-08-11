
export interface ICliente {
  id?: string;
  nombre_razon_social: string;
  documento_identidad: string;
  created_at?: string;
  telefono?: string;
  direccion?: string;
  correo?: string;
  empresa_id: string;
}

export function extraerNombreClienteTexto(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed === '[object Object]' ? '' : trimmed;
  }
  if (typeof val === 'number' || typeof val === 'bigint') {
    return String(val);
  }
  if (typeof val === 'object') {
    const prop = val.nombre_razon_social ??
                 val.cliente_nombre ??
                 val.clientenombre ??
                 val.clienteNombre ??
                 val.nombre ??
                 val.razon_social ??
                 val.label ??
                 val.value ??
                 val.name ??
                 val.item;
    if (prop !== undefined && prop !== val) {
      return extraerNombreClienteTexto(prop);
    }
  }
  const finalStr = String(val).trim();
  return finalStr === '[object Object]' ? '' : finalStr;
}

export function extraerDocumentoClienteTexto(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed === '[object Object]' ? '' : trimmed;
  }
  if (typeof val === 'number' || typeof val === 'bigint') {
    return String(val);
  }
  if (typeof val === 'object') {
    const prop = val.documento_identidad ??
                 val.cliente_documento ??
                 val.clientedocumento ??
                 val.clienteDocumento ??
                 val.documento ??
                 val.ruc ??
                 val.dni ??
                 val.value;
    if (prop !== undefined && prop !== val) {
      return extraerDocumentoClienteTexto(prop);
    }
  }
  const finalStr = String(val).trim();
  return finalStr === '[object Object]' ? '' : finalStr;
}