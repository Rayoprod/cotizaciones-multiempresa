import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { ICotizacion } from '../models/cotizacion.model';
import { IEmpresa } from '../models/empresa.model';


@Injectable({ providedIn: 'root' })
export class SupabaseService {

  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
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

  async getEmpresasDelUsuario(): Promise<IEmpresa[]> {
    const usuario = await this.obtenerUsuarioActual();
    if (!usuario) return [];

    const { data: asignaciones, error: errAsig } = await this.client
      .from('usuario_empresa')
      .select('empresa_id')
      .eq('usuario_id', usuario.id)
      .eq('activo', true);

    if (errAsig || !asignaciones?.length) return [];

    const ids = asignaciones.map((a: any) => a.empresa_id);

    const { data, error } = await this.client
      .from('empresas')
      .select('*')
      .in('id', ids)
      .eq('activa', true)
      .order('id');

    if (error) throw error;
    return data as IEmpresa[];
  }

  async getEmpresas(): Promise<IEmpresa[]> {
    const { data, error } = await this.client
      .from('empresas')
      .select('*')
      .order('id');
    if (error) throw error;
    return data as IEmpresa[];
  }

  // ─── EMPRESAS CRUD ────────────────────────────────────────────────────────

  async guardarEmpresa(empresa: IEmpresa): Promise<IEmpresa> {
    const { data: existente } = await this.client
      .from('empresas')
      .select('id')
      .eq('id', empresa.id)
      .maybeSingle();

    if (existente) {
      const { id, ...datos } = empresa as any;
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
        .insert([empresa])
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
    if (producto.id) {
      const { data, error } = await this.client
        .from('productos').update(producto).eq('id', producto.id).select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      const { data, error } = await this.client
        .from('productos').insert([producto]).select();
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
    if (cliente.id) {
      const { data, error } = await this.client
        .from('clientes').update(cliente).eq('id', cliente.id).select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      const { data, error } = await this.client
        .from('clientes').insert([cliente]).select();
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
      .select('id, folio, fecha, empresa_id, cliente_nombre, cliente_documento, cliente_telefono, cliente_direccion, cliente_correo, subtotal, igv, total, estado, items, vendedor, lugar_entrega, observaciones, oculta')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });

    // Si NO queremos las ocultas, las filtramos explícitamente
    if (!incluirOcultas) {
      query = query.or('oculta.is.null,oculta.eq.false');
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ICotizacion[];
  }

  async guardarCotizacion(cotizacion: ICotizacion): Promise<ICotizacion> {
    const { data, error } = await this.client
      .from('cotizaciones').insert([cotizacion]).select().single();
    if (error) throw error;
    return data;
  }

  async actualizarEstado(id: string, nuevoEstado: string): Promise<ICotizacion> {
    const { data, error } = await this.client
      .from('cotizaciones').update({ estado: nuevoEstado })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async obtenerSiguienteFolio(empresaId: string): Promise<string> {
    const { data, error } = await this.client.rpc('getnextfolioempresa', {
      empresaid: empresaId
    });

    if (error || !data) {
      console.error('Error al obtener folio:', error);
      const prefijo = (empresaId || 'EMP').substring(0, 3).toUpperCase();
      const seq = String(Date.now() % 100000000).padStart(8, '0');
      return `${prefijo}-${seq}`;
    }

    return data;
  }

  // ─── CUENTAS BANCARIAS ────────────────────────────────────────────────────

  async getCuentasBancarias(empresaId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('cuentas_bancarias').select('*').eq('empresa_id', empresaId)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async guardarCuentaBancaria(cuenta: any): Promise<any> {
    const { data, error } = await this.client
      .from('cuentas_bancarias').insert([cuenta]).select().single();
    if (error) throw error;
    return data;
  }

  async actualizarCuentaBancaria(id: string, datos: any): Promise<any> {
    const { data, error } = await this.client
      .from('cuentas_bancarias').update(datos).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async eliminarCuentaBancaria(id: string): Promise<void> {
    const { error } = await this.client.from('cuentas_bancarias').delete().eq('id', id);
    if (error) throw error;
  }

  async sincronizarCuentasBancarias(empresaId: string, cuentas: any[]): Promise<void> {
    await this.client.from('cuentas_bancarias').delete().eq('empresa_id', empresaId);
    if (cuentas.length > 0) {
      const filas = cuentas.map((c, i) => ({
        empresa_id: empresaId,
        banco: c.banco,
        tipo_cuenta: c.tipo_cuenta || 'Corriente',
        moneda: c.moneda || 'PEN',
        numero: c.numero,
        cci: c.cci || null,
        titular: c.titular || null,
        activa: c.activa ?? true,
        orden: c.orden ?? i
      }));
      const { error } = await this.client.from('cuentas_bancarias').insert(filas);
      if (error) throw error;
    }
  }

  // ─── PERFILES Y ROLES ─────────────────────────────────────────────────────

  async obtenerPerfil(): Promise<{ rol: string } | null> {
    const usuario = await this.obtenerUsuarioActual();
    if (!usuario) return null;

    const { data, error } = await this.client
      .from('profiles').select('rol').eq('id', usuario.id).single();

    if (error) return null;
    return data;
  }

  // ─── USUARIOS (solo admin) ────────────────────────────────────────────────

  async getUsuarios(): Promise<any[]> {
    const { data, error } = await this.client
      .from('profiles').select('id, email, rol, activo').order('rol');
    if (error) throw error;
    return data || [];
  }

  async crearUsuario(email: string, password: string): Promise<any> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + '/login' }
    });
    if (error) throw error;
    return data;
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

  async eliminarUsuario(id: string): Promise<void> {
    const { error } = await this.client
      .from('profiles').delete().eq('id', id);
    if (error) throw error;
  }

  async getEmpresasDeUsuario(usuarioId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('usuario_empresa').select('empresa_id')
      .eq('usuario_id', usuarioId).eq('activo', true);
    if (error) throw error;
    return (data || []).map((r: any) => r.empresa_id);
  }

  async guardarEmpresasDeUsuario(usuarioId: string, empresaIds: string[]): Promise<void> {
    const { error: delError } = await this.client
      .from('usuario_empresa').delete().eq('usuario_id', usuarioId);
    if (delError) throw delError;

    if (!empresaIds.length) return;

    const filas = empresaIds.map(eid => ({
      usuario_id: usuarioId,
      empresa_id: eid,
      activo: true
    }));

    const { error } = await this.client.from('usuario_empresa').insert(filas);
    if (error) throw error;
  }
}
