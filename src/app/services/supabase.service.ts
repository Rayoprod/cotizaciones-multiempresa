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
    // Verificar si ya existe
    const { data: existente } = await this.client
      .from('empresas')
      .select('id')
      .eq('id', empresa.id)
      .maybeSingle();

    if (existente) {
      // UPDATE
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
      // INSERT
      const { data, error } = await this.client
        .from('empresas')
        .insert([empresa])
        .select()
        .single();
      if (error) throw error;
      return data as IEmpresa;
    }
  }

  async actualizarEmpresa(id: string, datos: any) {
    const { data, error } = await this.client
      .from('empresas')
      .update(datos)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  }

  async crearEmpresa(nuevaEmpresa: any) {
    const { data, error } = await this.client
      .from('empresas')
      .insert([nuevaEmpresa])
      .select();
    if (error) throw error;
    return data;
  }

  // ─── PRODUCTOS ────────────────────────────────────────────────────────────

  async getProductos(empresaId: string) {
    const { data, error } = await this.client
      .from('productos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('descripcion');
    if (error) throw error;
    return data || [];
  }

  async guardarProducto(producto: any) {
    if (producto.id) {
      const { data, error } = await this.client
        .from('productos')
        .update(producto)
        .eq('id', producto.id)
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      const { data, error } = await this.client
        .from('productos')
        .insert([producto])
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    }
  }

  async eliminarProducto(id: string) {
    const { error } = await this.client.from('productos').delete().eq('id', id);
    if (error) throw error;
  }

  async eliminarEmpresa(id: string): Promise<void> {
  const { error } = await this.client.from('empresas').delete().eq('id', id);
  if (error) throw error;
}

  // ─── CLIENTES ─────────────────────────────────────────────────────────────

  async getClientes(empresaId: string) {
    const { data, error } = await this.client
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre_razon_social');
    if (error) throw error;
    return data || [];
  }

  async guardarCliente(cliente: any) {
    if (cliente.id) {
      const { data, error } = await this.client
        .from('clientes')
        .update(cliente)
        .eq('id', cliente.id)
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      const { data, error } = await this.client
        .from('clientes')
        .insert([cliente])
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    }
  }

  async eliminarCliente(id: string) {
    const { error } = await this.client.from('clientes').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── COTIZACIONES ─────────────────────────────────────────────────────────

  async getHistorial(empresaId: string): Promise<ICotizacion[]> {
  if (!empresaId) return [];   // ← guardia crítica

  const { data, error } = await this.client
    .from('cotizaciones')
    .select('*')
    .eq('empresa_id', empresaId)   // ← filtro obligatorio
    .order('fecha', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
  async guardarCotizacion(cotizacion: ICotizacion) {
    const { data, error } = await this.client
      .from('cotizaciones')
      .insert([cotizacion]);
    if (error) throw error;
    return data;
  }

  async actualizarEstado(id: string, nuevoEstado: string) {
    const { data, error } = await this.client
      .from('cotizaciones')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  }

  async obtenerSiguienteFolio(empresaId: string) {
    const { data, error } = await this.client.rpc('get_next_folio_empresa', { empresa_id: empresaId });
    if (error) {
      console.error('Error al obtener folio:', error);
      return `COT-${empresaId}-${new Date().getTime()}`;
    }
    return data;
  }

  // ─── PERFILES Y ROLES ─────────────────────────────────────────────────────

  async obtenerPerfil(): Promise<{ rol: string } | null> {
    const usuario = await this.obtenerUsuarioActual();
    if (!usuario) return null;

    const { data, error } = await this.client
      .from('profiles')
      .select('rol')
      .eq('id', usuario.id)
      .single();

    if (error) return null;
    return data;
  }

  // ─── USUARIOS (solo admin) ────────────────────────────────────────────────

  async getUsuarios(): Promise<any[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, email, rol, activo')
      .order('rol');
    if (error) throw error;
    return data || [];
  }

  async crearUsuario(email: string, password: string): Promise<any> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async actualizarRolUsuario(id: string, rol: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ rol })
      .eq('id', id);
    if (error) throw error;
  }

  async toggleActivoUsuario(id: string, activo: boolean): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ activo })
      .eq('id', id);
    if (error) throw error;
  }

  async eliminarUsuario(id: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async getEmpresasDeUsuario(usuarioId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('usuario_empresa')
      .select('empresa_id')
      .eq('usuario_id', usuarioId)
      .eq('activo', true);
    if (error) throw error;
    return (data || []).map((r: any) => r.empresa_id);
  }

  async guardarEmpresasDeUsuario(usuarioId: string, empresaIds: string[]): Promise<void> {
    await this.client
      .from('usuario_empresa')
      .update({ activo: false })
      .eq('usuario_id', usuarioId);

    if (!empresaIds.length) return;

    const filas = empresaIds.map(eid => ({
      usuario_id: usuarioId,
      empresa_id: eid,
      activo: true
    }));

    const { error } = await this.client
      .from('usuario_empresa')
      .upsert(filas, { onConflict: 'usuario_id,empresa_id' });

    if (error) throw error;
  }
}