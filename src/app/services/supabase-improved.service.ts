import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { DatabaseSchema, EmpresaTable, ProfileTable, ClienteTable, ProductoTable, CotizacionTable, CuentaBancariaTable, UsuarioEmpresaTable } from '../models/database-schema';

@Injectable({ providedIn: 'root' })
export class SupabaseImprovedService {
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

  async crearUsuario(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/login'
      }
    });
    if (error) throw error;
    return data;
  }

  // ─── EMPRESAS ───────────────────────────────────────────────────────────────

  async getEmpresas(): Promise<EmpresaTable[]> {
    const { data, error } = await this.client
      .from('empresas')
      .select('*')
      .order('id');
    if (error) throw error;
    return data || [];
  }

  async getEmpresaById(id: string): Promise<EmpresaTable | null> {
    const { data, error } = await this.client
      .from('empresas')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async guardarEmpresa(empresa: EmpresaTable): Promise<EmpresaTable> {
    // Verificar si ya existe
    const { data: existente } = await this.client
      .from('empresas')
      .select('id')
      .eq('id', empresa.id)
      .maybeSingle();

    if (existente) {
      // UPDATE
      const { data, error } = await this.client
        .from('empresas')
        .update(empresa)
        .eq('id', empresa.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      // INSERT
      const { data, error } = await this.client
        .from('empresas')
        .insert([empresa])
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }

  async eliminarEmpresa(id: string): Promise<void> {
    const { error } = await this.client.from('empresas').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── CUENTAS BANCARIAS (Tabla separada) ───────────────────────────────────

  async getCuentasBancarias(empresaId: string): Promise<CuentaBancariaTable[]> {
    const { data, error } = await this.client
      .from('cuentas_bancarias')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async guardarCuentaBancaria(cuenta: Omit<CuentaBancariaTable, 'id' | 'created_at'>): Promise<CuentaBancariaTable> {
    const { data, error } = await this.client
      .from('cuentas_bancarias')
      .insert([cuenta])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async actualizarCuentaBancaria(id: string, datos: Partial<CuentaBancariaTable>): Promise<CuentaBancariaTable> {
    const { data, error } = await this.client
      .from('cuentas_bancarias')
      .update(datos)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async eliminarCuentaBancaria(id: string): Promise<void> {
    const { error } = await this.client.from('cuentas_bancarias').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── USUARIOS Y PERFILES ─────────────────────────────────────────────────────

  async getUsuarios(): Promise<ProfileTable[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, email, rol, activo, created_at')
      .order('rol');
    if (error) throw error;
    return data || [];
  }

  async getUsuarioById(id: string): Promise<ProfileTable | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
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

  // ─── ASIGNACIÓN EMPRESA-USUARIO ─────────────────────────────────────────────

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
    // Desactivar todas las asignaciones existentes
    await this.client
      .from('usuario_empresa')
      .update({ activo: false })
      .eq('usuario_id', usuarioId);

    if (!empresaIds.length) return;

    // Insertar nuevas asignaciones
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

  // ─── CLIENTES ─────────────────────────────────────────────────────────────

  async getClientes(empresaId: string): Promise<ClienteTable[]> {
    const { data, error } = await this.client
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre_razon_social');
    if (error) throw error;
    return data || [];
  }

  async guardarCliente(cliente: Omit<ClienteTable, 'id' | 'created_at'>): Promise<ClienteTable> {
    const { data, error } = await this.client
      .from('clientes')
      .insert([cliente])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async actualizarCliente(id: string, datos: Partial<ClienteTable>): Promise<ClienteTable> {
    const { data, error } = await this.client
      .from('clientes')
      .update(datos)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async eliminarCliente(id: string): Promise<void> {
    const { error } = await this.client.from('clientes').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── PRODUCTOS ─────────────────────────────────────────────────────────────

  async getProductos(empresaId: string): Promise<ProductoTable[]> {
    const { data, error } = await this.client
      .from('productos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('descripcion');
    if (error) throw error;
    return data || [];
  }

  async guardarProducto(producto: Omit<ProductoTable, 'id' | 'created_at'>): Promise<ProductoTable> {
    const { data, error } = await this.client
      .from('productos')
      .insert([producto])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async actualizarProducto(id: string, datos: Partial<ProductoTable>): Promise<ProductoTable> {
    const { data, error } = await this.client
      .from('productos')
      .update(datos)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async eliminarProducto(id: string): Promise<void> {
    const { error } = await this.client.from('productos').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── COTIZACIONES ─────────────────────────────────────────────────────────

  async getHistorial(empresaId: string): Promise<CotizacionTable[]> {
    if (!empresaId) return [];

    const { data, error } = await this.client
      .from('cotizaciones')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async guardarCotizacion(cotizacion: Omit<CotizacionTable, 'id'>): Promise<CotizacionTable> {
    const { data, error } = await this.client
      .from('cotizaciones')
      .insert([cotizacion])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async actualizarCotizacion(id: string, datos: Partial<CotizacionTable>): Promise<CotizacionTable> {
    const { data, error } = await this.client
      .from('cotizaciones')
      .update(datos)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async actualizarEstado(id: string, nuevoEstado: string): Promise<CotizacionTable> {
    const { data, error } = await this.client
      .from('cotizaciones')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async eliminarCotizacion(id: string): Promise<void> {
    const { error } = await this.client.from('cotizaciones').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── FOLIOS (Secuencia por empresa) ────────────────────────────────────────

  async obtenerSiguienteFolio(empresaId: string): Promise<string> {
    // Primero obtener el prefijo de la empresa
    const { data: empresa } = await this.client
      .from('empresas')
      .select('prefijo')
      .eq('id', empresaId)
      .single();

    const prefijo = empresa?.prefijo || 'EMP';

    // Obtener última secuencia
    const { data: folioData } = await this.client
      .from('folios_empresas')
      .select('secuencia')
      .eq('empresa_codigo', empresaId)
      .single();

    let nuevaSecuencia = 1;
    if (folioData?.secuencia) {
      nuevaSecuencia = folioData.secuencia + 1;
    }

    // Actualizar secuencia
    await this.client
      .from('folios_empresas')
      .upsert({
        empresa_codigo: empresaId,
        secuencia: nuevaSecuencia
      }, { onConflict: 'empresa_codigo' });

    // Formatear folio
    const numeroFormateado = nuevaSecuencia.toString().padStart(8, '0');
    return `${prefijo}-${numeroFormateado}`;
  }

  // ─── UTILIDADES ─────────────────────────────────────────────────────────────

  async verificarRucDuplicado(ruc: string, empresaIdExcluir?: string): Promise<boolean> {
    let query = this.client
      .from('empresas')
      .select('id')
      .eq('ruc', ruc);

    if (empresaIdExcluir) {
      query = query.neq('id', empresaIdExcluir);
    }

    const { data } = await query.maybeSingle();
    return !!data;
  }

  async verificarIdDuplicado(id: string, empresaIdExcluir?: string): Promise<boolean> {
    let query = this.client
      .from('empresas')
      .select('id')
      .eq('id', id);

    if (empresaIdExcluir) {
      query = query.neq('id', empresaIdExcluir);
    }

    const { data } = await query.maybeSingle();
    return !!data;
  }
}
