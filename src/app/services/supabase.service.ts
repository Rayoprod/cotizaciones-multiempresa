import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import {
  IEmpresa, ICotizacion, ICuentaBancaria, INuevaCotizacion, IProfile,
  IAsignacionEmpresa, RolGlobal, ICondicionesPdf, IDatosVenta, IVenta, IVentaCambio,
  EstadoEntrega, MetodoPago, ModoIgv, TipoComprobante, adelantoDe
} from '../models';

@Injectable({ providedIn: 'root' })
export class SupabaseService {

  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: async (name, _acquireTimeout, fn) => {
          if (typeof navigator !== 'undefined' && navigator?.locks) {
            try {
              return await navigator.locks.request(name, fn);
            } catch {
              return await fn();
            }
          }
          return await fn();
        }
      }
    });
  }

  // ─── AUTH ─────────────────────────────────────────────────────────────────

  async iniciarSesion(email: string, password: string) {
    return await this.client.auth.signInWithPassword({ email, password });
  }

  async obtenerSesion() {
    return await this.client.auth.getSession();
  }

  async cerrarSesion() {
    return await this.client.auth.signOut();
  }

  async obtenerUsuarioActual() {
    const { data } = await this.client.auth.getUser();
    return data?.user ?? null;
  }

  // ─── EMPRESAS DEL USUARIO ─────────────────────────────────────────────────

  /**
   * Empresas que el usuario actual puede ver, cada una con sus cuentas
   * bancarias y `mi_rol`, en un solo pedido (mis_empresas). El superadmin ve
   * todas como admin. Para no repetir el pedido, usar EmpresasUsuarioService.
   */
  async getEmpresasDelUsuario(incluirInactivas = false): Promise<IEmpresa[]> {
    const { data, error } = await this.client.rpc('mis_empresas', { p_incluir_inactivas: incluirInactivas });
    if (error) throw error;
    return (data ?? []) as IEmpresa[];
  }

  /** Lista liviana de todas las empresas (sin cuentas), para asignarlas a usuarios. */
  async getEmpresas(): Promise<IEmpresa[]> {
    const { data, error } = await this.client
      .from('empresas')
      .select('id, nombre_comercial, ruc, ruta_logo, color, activa')
      .order('id');
    if (error) throw error;
    return data as IEmpresa[];
  }

  // ─── EMPRESAS CRUD ────────────────────────────────────────────────────────

  async guardarEmpresa(empresa: IEmpresa): Promise<IEmpresa> {
    const { cuentas_bancarias, ...empresaLimpia } = empresa as any;

    const { data: existente } = await this.client
      .from('empresas')
      .select('id')
      .eq('id', empresaLimpia.id)
      .maybeSingle();

    if (existente) {
      const { id, ...datos } = empresaLimpia;
      const { data, error } = await this.client
        .from('empresas')
        .update(datos)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as IEmpresa;
    } else {
      const { data, error } = await this.client
        .from('empresas')
        .insert([empresaLimpia])
        .select()
        .single();
      if (error) throw error;
      return data as IEmpresa;
    }
  }

  async verificarIdExistente(id: string): Promise<boolean> {
    const { data } = await this.client
      .from('empresas').select('id').eq('id', id).maybeSingle();
    return !!data;
  }

  async verificarPrefijoExistente(prefijo: string): Promise<boolean> {
    const { data } = await this.client
      .from('empresas').select('prefijo').ilike('prefijo', prefijo).maybeSingle();
    return !!data;
  }

  async verificarRucExistente(ruc: string): Promise<boolean> {
    const { data } = await this.client
      .from('empresas').select('ruc').eq('ruc', ruc).maybeSingle();
    return !!data;
  }

  async actualizarEmpresa(id: string, datos: any) {
    const { data, error } = await this.client
      .from('empresas').update(datos).eq('id', id).select();
    if (error) throw error;
    return data;
  }

  async crearEmpresa(nuevaEmpresa: any) {
    const { data, error } = await this.client
      .from('empresas').insert([nuevaEmpresa]).select();
    if (error) throw error;
    return data;
  }

  async eliminarEmpresa(id: string): Promise<void> {
    const { error } = await this.client.from('empresas').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── PRODUCTOS ────────────────────────────────────────────────────────────

  async getProductos(empresaId: string) {
    const { data, error } = await this.client
      .from('productos').select('*').eq('empresa_id', empresaId).order('descripcion');
    if (error) throw error;
    return data || [];
  }

  async guardarProducto(producto: any) {
    const payload = { ...producto };
    if (!payload.id || String(payload.id).trim() === '') delete payload.id;
    if (!payload.created_at || String(payload.created_at).trim() === '') delete payload.created_at;
    if (payload.precio_unitario_base !== undefined && payload.precio_unitario_base !== null) {
      payload.precio_unitario_base = Number(payload.precio_unitario_base) || 0;
    }

    if (payload.id) {
      const { data, error } = await this.client
        .from('productos').update(payload).eq('id', payload.id).select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      const { data, error } = await this.client
        .from('productos').insert([payload]).select();
      if (error) throw error;
      return data ? data[0] : null;
    }
  }

  async eliminarProducto(id: string) {
    const { error } = await this.client.from('productos').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── CLIENTES ─────────────────────────────────────────────────────────────

  async getClientes(empresaId: string) {
    const { data, error } = await this.client
      .from('clientes').select('*').eq('empresa_id', empresaId)
      .order('nombre_razon_social');
    if (error) throw error;
    return data || [];
  }

  async guardarCliente(cliente: any) {
    const payload = { ...cliente };
    if (!payload.id || String(payload.id).trim() === '') delete payload.id;
    if (!payload.created_at || String(payload.created_at).trim() === '') delete payload.created_at;

    if (payload.id) {
      const { data, error } = await this.client
        .from('clientes').update(payload).eq('id', payload.id).select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      const { data, error } = await this.client
        .from('clientes').insert([payload]).select();
      if (error) throw error;
      return data ? data[0] : null;
    }
  }

  async eliminarCliente(id: string) {
    const { error } = await this.client.from('clientes').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── COTIZACIONES ─────────────────────────────────────────────────────────

  /**
   * Obtiene el historial de cotizaciones de una empresa.
   * @param empresaId  ID de la empresa activa (obligatorio)
   * @param incluirOcultas  Si es true, devuelve también las filas con oculta = true (default: false)
   */
  async getHistorial(empresaId: string, incluirOcultas = false): Promise<ICotizacion[]> {
    if (!empresaId) return [];

    let query = this.client
      .from('cotizaciones')
      .select('id, folio, fecha, empresa_id, cliente_id, cliente_nombre, cliente_documento, cliente_telefono, cliente_direccion, cliente_correo, subtotal, descuento_global, igv, total, incluye_igv, precios_con_igv, estado, estado_cambiado_en, estado_cambiado_por_nombre, items, vendedor, vendedor_nombre, lugar_entrega, observaciones, condiciones, oculta, cotizacion_origen_id, tipo_origen, folio_origen')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });

    // Si NO queremos las ocultas, las filtramos explícitamente (usando índice b-tree)
    if (!incluirOcultas) {
      query = query.eq('oculta', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ICotizacion[];
  }

  /**
   * Crea la cotización en una sola transacción (crear_cotizacion en Postgres):
   * folio, totales, cliente en la cartera y, si es una revisión, la anulación
   * de la original. Si algo falla no se guarda nada.
   */
  async crearCotizacion(datos: INuevaCotizacion): Promise<ICotizacion> {
    const { data, error } = await this.client.rpc('crear_cotizacion', {
      p_empresa_id: datos.empresaId,
      p_cliente: datos.cliente,
      p_items: datos.items,
      p_incluye_igv: datos.modoIgv !== 'sin_igv',
      p_precios_con_igv: datos.modoIgv === 'incluido',
      p_descuento: datos.descuento,
      p_lugar_entrega: datos.lugarEntrega ?? null,
      p_observaciones: datos.observaciones ?? null,
      p_condiciones: datos.condiciones,
      p_origen_id: datos.origen?.id ?? null,
      p_tipo_origen: datos.origen?.tipo ?? null,
      p_guardar_cliente: datos.guardarCliente
    });
    if (error) throw error;
    return data as ICotizacion;
  }

  async actualizarEstado(id: string, nuevoEstado: string): Promise<ICotizacion> {
    const { data, error } = await this.client
      .from('cotizaciones').update({ estado: nuevoEstado })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async actualizarVisibilidadCotizacion(id: string, oculta: boolean): Promise<void> {
    const { error } = await this.client
      .from('cotizaciones')
      .update({ oculta })
      .eq('id', id);
    if (error) throw error;
  }

  // ─── VENTAS Y PAGOS ───────────────────────────────────────────────────────
  // Las escrituras van todas por funciones de Postgres: cada una valida permisos
  // y reglas, y devuelve la venta completa, con sus líneas, pagos e historial.

  async getVentas(empresaId: string): Promise<IVenta[]> {
    const { data, error } = await this.client
      .from('ventas')
      .select('*, venta_items(*), pagos(*)')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false })
      .order('registrada_en', { ascending: false })
      .order('orden', { referencedTable: 'venta_items' })
      .order('registrado_en', { referencedTable: 'pagos' });
    if (error) throw error;
    return (data ?? []) as IVenta[];
  }

  async getCambiosVenta(ventaId: string): Promise<IVentaCambio[]> {
    const { data, error } = await this.client
      .from('venta_cambios')
      .select('*')
      .eq('venta_id', ventaId)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data ?? []) as IVentaCambio[];
  }

  /** De cada cotización convertida, su venta activa. */
  async getVentasDeCotizaciones(empresaId: string): Promise<Array<Pick<IVenta, 'id' | 'folio' | 'cotizacion_id'>>> {
    const { data, error } = await this.client
      .from('ventas')
      .select('id, folio, cotizacion_id')
      .eq('empresa_id', empresaId)
      .eq('estado', 'ACTIVA')
      .not('cotizacion_id', 'is', null);
    if (error) throw error;
    return data ?? [];
  }

  async crearVenta(datos: {
    empresaId: string;
    cliente: INuevaCotizacion['cliente'];
    items: INuevaCotizacion['items'];
    modoIgv: ModoIgv;
    descuento: number;
    lugarEntrega: string | null;
    observaciones: string | null;
    condiciones: Pick<ICondicionesPdf, 'mostrarCuentas'>;
    datosVenta: IDatosVenta;
    guardarCliente: boolean;
  }): Promise<IVenta> {
    const { data, error } = await this.client.rpc('crear_venta', {
      p_empresa_id: datos.empresaId,
      p_cliente: datos.cliente,
      p_items: datos.items,
      p_incluye_igv: datos.modoIgv !== 'sin_igv',
      p_precios_con_igv: datos.modoIgv === 'incluido',
      p_descuento: datos.descuento,
      p_lugar_entrega: datos.lugarEntrega,
      p_observaciones: datos.observaciones,
      p_condiciones: datos.condiciones,
      p_condicion_pago: datos.datosVenta.condicionPago,
      p_dias_credito: datos.datosVenta.diasCredito,
      p_fecha: datos.datosVenta.fecha,
      p_adelanto: adelantoDe(datos.datosVenta),
      p_estado_entrega: datos.datosVenta.estadoEntrega,
      p_guardar_cliente: datos.guardarCliente
    });
    if (error) throw error;
    return data as IVenta;
  }

  /** La cotización pasa a Aprobada en la misma transacción. */
  async convertirCotizacionEnVenta(cotizacionId: string, datosVenta: IDatosVenta, documento: string | null): Promise<IVenta> {
    const { data, error } = await this.client.rpc('convertir_cotizacion_en_venta', {
      p_cotizacion_id: cotizacionId,
      p_condicion_pago: datosVenta.condicionPago,
      p_dias_credito: datosVenta.diasCredito,
      p_fecha: datosVenta.fecha,
      p_adelanto: adelantoDe(datosVenta),
      p_estado_entrega: datosVenta.estadoEntrega,
      p_documento: documento
    });
    if (error) throw error;
    return data as IVenta;
  }

  async ajustarVenta(datos: {
    ventaId: string;
    items: Array<INuevaCotizacion['items'][number] & { id?: string | null }>;
    modoIgv: ModoIgv;
    descuento: number;
    lugarEntrega: string | null;
    observaciones: string | null;
    datosVenta: Pick<IDatosVenta, 'fecha' | 'condicionPago' | 'diasCredito'>;
    motivo: string;
  }): Promise<IVenta> {
    const { data, error } = await this.client.rpc('ajustar_venta', {
      p_venta_id: datos.ventaId,
      p_items: datos.items,
      p_incluye_igv: datos.modoIgv !== 'sin_igv',
      p_precios_con_igv: datos.modoIgv === 'incluido',
      p_descuento: datos.descuento,
      p_lugar_entrega: datos.lugarEntrega,
      p_observaciones: datos.observaciones,
      p_condicion_pago: datos.datosVenta.condicionPago,
      p_dias_credito: datos.datosVenta.diasCredito,
      p_motivo: datos.motivo,
      p_fecha: datos.datosVenta.fecha
    });
    if (error) throw error;
    return data as IVenta;
  }

  async anularVenta(ventaId: string, motivo: string): Promise<IVenta> {
    const { data, error } = await this.client.rpc('anular_venta', { p_venta_id: ventaId, p_motivo: motivo });
    if (error) throw error;
    return data as IVenta;
  }

  async marcarEntregaVenta(ventaId: string, estado: EstadoEntrega): Promise<IVenta> {
    const { data, error } = await this.client.rpc('marcar_entrega_venta', { p_venta_id: ventaId, p_estado: estado });
    if (error) throw error;
    return data as IVenta;
  }

  /** Sin número, quita el comprobante. */
  async guardarComprobanteVenta(ventaId: string, tipo: TipoComprobante, numero: string): Promise<IVenta> {
    const { data, error } = await this.client.rpc('guardar_comprobante_venta', {
      p_venta_id: ventaId, p_tipo: tipo, p_numero: numero
    });
    if (error) throw error;
    return data as IVenta;
  }

  async registrarPago(ventaId: string, pago: {
    monto: number;
    metodo: MetodoPago;
    fecha: string;
    referencia?: string | null;
    nota?: string | null;
  }): Promise<IVenta> {
    const { data, error } = await this.client.rpc('registrar_pago', {
      p_venta_id: ventaId,
      p_monto: pago.monto,
      p_metodo: pago.metodo,
      p_fecha: pago.fecha,
      p_referencia: pago.referencia ?? null,
      p_nota: pago.nota ?? null
    });
    if (error) throw error;
    return data as IVenta;
  }

  async anularPago(pagoId: string, motivo: string): Promise<IVenta> {
    const { data, error } = await this.client.rpc('anular_pago', { p_pago_id: pagoId, p_motivo: motivo });
    if (error) throw error;
    return data as IVenta;
  }

  // ─── CUENTAS BANCARIAS ────────────────────────────────────────────────────

  async getCuentasBancarias(empresaId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('cuentas_bancarias').select('*').eq('empresa_id', empresaId)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /** Reemplaza las cuentas de la empresa en una sola transacción (guardar_cuentas_bancarias). */
  async sincronizarCuentasBancarias(empresaId: string, cuentas: ICuentaBancaria[]): Promise<void> {
    const { error } = await this.client.rpc('guardar_cuentas_bancarias', {
      p_empresa_id: empresaId,
      p_cuentas: cuentas.map(c => ({
        banco: c.banco,
        tipo_cuenta: c.tipo_cuenta,
        moneda: c.moneda,
        numero: c.numero,
        cci: c.cci,
        titular: c.titular,
        activa: c.activa
      }))
    });
    if (error) throw error;
  }

  // ─── LOGOS Y FIRMAS ───────────────────────────────────────────────────────

  /** Sube la imagen al bucket `empresas` (carpeta de la empresa) y devuelve su URL pública. */
  async subirImagenEmpresa(empresaId: string, tipo: 'logo' | 'firma', imagen: Blob, extension: string): Promise<string> {
    const ruta = `${empresaId}/${tipo}-${Date.now()}.${extension}`;
    const { error } = await this.client.storage.from('empresas').upload(ruta, imagen, {
      contentType: imagen.type,
      cacheControl: '31536000',
      upsert: false
    });
    if (error) throw error;
    return this.client.storage.from('empresas').getPublicUrl(ruta).data.publicUrl;
  }

  // ─── PERFILES Y ROLES ─────────────────────────────────────────────────────

  /** null si el usuario no tiene perfil; lanza error si no se pudo consultar. */
  async obtenerPerfil(userId?: string): Promise<IProfile | null> {
    const id = userId || (await this.obtenerUsuarioActual())?.id;
    if (!id) return null;

    const { data, error } = await this.client
      .from('profiles').select('id, email, rol, activo').eq('id', id).maybeSingle();

    if (error) throw error;
    return data as IProfile | null;
  }

  async guardarPerfil(perfil: { id: string, email: string, rol: string, activo?: boolean }): Promise<void> {
    const { error } = await this.client.from('profiles').upsert({
      id: perfil.id,
      email: perfil.email,
      rol: perfil.rol,
      activo: perfil.activo ?? true
    });
    if (error) throw error;
  }

  // ─── USUARIOS (solo admin) ────────────────────────────────────────────────

  async getUsuarios(): Promise<any[]> {
    const { data, error } = await this.client
      .from('profiles').select('id, email, nombre, rol, activo').order('rol');
    if (error) throw error;
    return data || [];
  }

  /** rol: 'admin' (superadmin) o 'usuario'; el rol en cada empresa se asigna aparte. */
  async crearUsuario(email: string, password: string, rol: RolGlobal = 'usuario'): Promise<any> {
    const { data, error } = await this.client.rpc('admin_crear_usuario', {
      p_email: email,
      p_password: password,
      p_rol: rol
    });
    if (error) throw error;
    return data;
  }

  /** El nombre que imprime el PDF en las cotizaciones que esta cuenta cree desde ahora. */
  async actualizarNombreUsuario(id: string, nombre: string | null): Promise<void> {
    const { error } = await this.client
      .from('profiles').update({ nombre }).eq('id', id);
    if (error) throw error;
  }

  async actualizarRolUsuario(id: string, rol: string): Promise<void> {
    const { error } = await this.client
      .from('profiles').update({ rol }).eq('id', id);
    if (error) throw error;
  }

  async toggleActivoUsuario(id: string, activo: boolean): Promise<void> {
    const { error } = await this.client
      .from('profiles').update({ activo }).eq('id', id);
    if (error) throw error;
  }

  /** Borra la cuenta en auth (y en cascada su perfil y asignaciones). */
  async eliminarUsuario(id: string): Promise<void> {
    const { error } = await this.client.rpc('admin_eliminar_usuario', { p_user_id: id });
    if (error) throw error;
  }

  /** Asignaciones activas de todos los usuarios (las ve completas solo el superadmin). */
  async getAsignaciones(): Promise<Array<IAsignacionEmpresa & { usuario_id: string }>> {
    const { data, error } = await this.client
      .from('usuario_empresa').select('usuario_id, empresa_id, rol').eq('activo', true);
    if (error) throw error;
    return (data || []) as Array<IAsignacionEmpresa & { usuario_id: string }>;
  }

  async getEmpresasDeUsuario(usuarioId: string): Promise<IAsignacionEmpresa[]> {
    const { data, error } = await this.client
      .from('usuario_empresa').select('empresa_id, rol')
      .eq('usuario_id', usuarioId).eq('activo', true);
    if (error) throw error;
    return (data || []) as IAsignacionEmpresa[];
  }

  /**
   * Deja al usuario exactamente con estas empresas y roles, conservando las
   * asignaciones que ya tenía (asignar_empresas_usuario).
   */
  async guardarEmpresasDeUsuario(usuarioId: string, asignaciones: IAsignacionEmpresa[]): Promise<void> {
    const { error } = await this.client.rpc('asignar_empresas_usuario', {
      p_usuario_id: usuarioId,
      p_asignaciones: asignaciones
    });
    if (error) throw error;
  }
}

