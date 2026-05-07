// ── ESQUEMA COMPLETO DE BASE DE DATOS SUPABASE ─────────────────────────────

export interface DatabaseSchema {
  // ── TABLAS PRINCIPALES ──────────────────────────────────────────────────
  
  empresas: EmpresaTable;
  profiles: ProfileTable;
  usuario_empresa: UsuarioEmpresaTable;
  clientes: ClienteTable;
  productos: ProductoTable;
  cotizaciones: CotizacionTable;
  cuentas_bancarias: CuentaBancariaTable;
  folios_empresas: FolioEmpresaTable;
}

// ── INTERFACES DE TABLAS ──────────────────────────────────────────────────

export interface EmpresaTable {
  id: string;                    // Primary Key - ID del sistema
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
  cuentas_bancarias?: CuentaBancariaData[]; // JSONB
  contacto_aprobacion?: string;
  mostrar_cuentas?: boolean;
  prefijo?: string;
}

export interface ProfileTable {
  id: string;                    // Primary Key - UUID (FK a auth.users)
  rol?: 'admin' | 'admin_empresa' | 'vendedor';
  created_at?: string;
  activo?: boolean;
  email?: string;
}

export interface UsuarioEmpresaTable {
  id: string;                    // Primary Key - UUID
  usuario_id: string;             // FK a profiles.id
  empresa_id: string;             // FK a empresas.id
  rol?: string;
  activo?: boolean;
  created_at?: string;
}

export interface ClienteTable {
  id: string;                    // Primary Key - UUID
  nombre_razon_social: string;
  documento_identidad?: string;   // DNI o RUC
  created_at: string;
  telefono?: string;
  direccion?: string;
  correo?: string;
  empresa_id?: string;           // FK a empresas.id
}

export interface ProductoTable {
  id: string;                    // Primary Key - UUID
  codigo_sku: string;
  descripcion: string;
  unidad?: string;
  precio_unitario_base: number;
  created_at: string;
  empresa_id?: string;           // FK a empresas.id
}

export interface CotizacionTable {
  id: string;                    // Primary Key - UUID
  folio: string;
  fecha?: string;                // timestamptz
  empresa_id: string;            // FK a empresas.id
  cliente_id?: string;           // FK a clientes.id
  cliente_nombre: string;
  cliente_documento?: string;
  subtotal: number;
  igv: number;
  total: number;
  estado?: 'PENDIENTE' | 'APROBADA' | 'ANULADA';
  items: CotizacionItem[];        // JSONB
  vendedor?: string;
  lugar_entrega?: string;
  observaciones?: string;
  cliente_telefono?: string;
  cliente_direccion?: string;
  cliente_correo?: string;
}

export interface CuentaBancariaTable {
  id: string;                    // Primary Key - UUID
  empresa_id: string;             // FK a empresas.id
  banco: string;
  tipo_cuenta: string;
  moneda: string;
  numero: string;
  cci?: string;
  titular?: string;
  activa?: boolean;
  orden?: number;
  created_at?: string;
}

export interface FolioEmpresaTable {
  empresa_codigo: string;        // Primary Key - FK a empresas.id
  secuencia?: number;
}

// ── INTERFACES DE DATOS ANIDADOS ─────────────────────────────────────────────

export interface CuentaBancariaData {
  banco: string;
  tipo_cuenta: string;
  moneda: string;
  numero: string;
  cci?: string;
  titular?: string;
  activa?: boolean;
  orden?: number;
}

export interface CotizacionItem {
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

// ── TIPOS Y ENUMS ────────────────────────────────────────────────────────

export type RolUsuario = 'admin' | 'vendedor';
export type EstadoCotizacion = 'PENDIENTE' | 'APROBADA' | 'ANULADA';
export type Moneda = 'PEN' | 'USD' | 'EUR';
export type TipoCuenta = 'ahorros' | 'corriente' | 'vista';

// ── RELACIONES ENTRE TABLAS ───────────────────────────────────────────────

export interface DatabaseRelations {
  // Un usuario puede tener muchas empresas
  'profiles.usuario_empresa': ProfileTable & {
    usuario_empresa: UsuarioEmpresaTable[];
  };
  
  // Una empresa puede tener muchos usuarios
  'empresas.usuario_empresa': EmpresaTable & {
    usuario_empresa: UsuarioEmpresaTable[];
  };
  
  // Una empresa tiene muchas cotizaciones
  'empresas.cotizaciones': EmpresaTable & {
    cotizaciones: CotizacionTable[];
  };
  
  // Una empresa tiene muchos productos
  'empresas.productos': EmpresaTable & {
    productos: ProductoTable[];
  };
  
  // Una empresa tiene muchos clientes
  'empresas.clientes': EmpresaTable & {
    clientes: ClienteTable[];
  };
  
  // Una empresa tiene muchas cuentas bancarias
  'empresas.cuentas_bancarias': EmpresaTable & {
    cuentas_bancarias: CuentaBancariaTable[];
  };
  
  // Una cotización pertenece a un cliente
  'cotizaciones.clientes': CotizacionTable & {
    clientes: ClienteTable;
  };
}

// ── POLÍTICAS DE SEGURIDAD (RLS) ───────────────────────────────────────────

export interface SecurityPolicies {
  // Solo usuarios autenticados pueden leer sus datos
  authenticated_users: 'authenticated';
  
  // Solo admins pueden gestionar usuarios
  admin_users: 'admin';
  
  // Vendedores solo ven sus empresas asignadas
  vendedor_empresas: 'vendedor';
}

// ── VISTAS ÚTILES ─────────────────────────────────────────────────────────

export interface DatabaseViews {
  // Vista de cotizaciones con datos del cliente
  cotizaciones_completas: CotizacionTable & {
    clientes: ClienteTable;
    empresas: EmpresaTable;
  };
  
  // Vista de empresas con usuarios asignados
  empresas_con_usuarios: EmpresaTable & {
    usuario_empresa: (UsuarioEmpresaTable & {
      profiles: ProfileTable;
    })[];
  };
}
