import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { IEmpresa, ICotizacion, ICuentaBancaria, IMaquinaria, ILecturaHorometro } from '../models';

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

    const [empresasRes, cuentasRes] = await Promise.all([
      this.client
        .from('empresas')
        .select('*')
        .in('id', ids)
        .eq('activa', true)
        .order('id'),
      this.client
        .from('cuentas_bancarias')
        .select('*')
        .in('empresa_id', ids)
        .order('orden', { ascending: true })
    ]);

    if (empresasRes.error) throw empresasRes.error;
    const empresas = (empresasRes.data || []) as IEmpresa[];

    const cuentasMap = new Map<string, ICuentaBancaria[]>();
    if (cuentasRes.data) {
      for (const c of cuentasRes.data) {
        const list = cuentasMap.get(c.empresa_id) || [];
        list.push({
          id: c.id,
          empresa_id: c.empresa_id,
          banco: c.banco,
          tipo_cuenta: c.tipo_cuenta,
          moneda: c.moneda,
          numero: c.numero,
          cci: c.cci || '',
          titular: c.titular || '',
          activa: c.activa,
          orden: c.orden
        });
        cuentasMap.set(c.empresa_id, list);
      }
    }

    return empresas.map(e => ({
      ...e,
      cuentas_bancarias: cuentasMap.get(e.id) ?? []
    }));
  }

  async getEmpresas(): Promise<IEmpresa[]> {
    const { data, error } = await this.client
      .from('empresas')
      .select('*')
      .order('id');
    if (error) throw error;
    return data as IEmpresa[];
  }

  async getEmpresasConCuentas(): Promise<IEmpresa[]> {
    const empresas = await this.getEmpresas();
    if (!empresas.length) return [];
    const ids = empresas.map(e => e.id);
    const { data: todasCuentas } = await this.client
      .from('cuentas_bancarias')
      .select('*')
      .in('empresa_id', ids)
      .order('orden', { ascending: true });

    const cuentasMap = new Map<string, ICuentaBancaria[]>();
    if (todasCuentas) {
      for (const c of todasCuentas) {
        const list = cuentasMap.get(c.empresa_id) || [];
        list.push({
          id: c.id,
          empresa_id: c.empresa_id,
          banco: c.banco,
          tipo_cuenta: c.tipo_cuenta,
          moneda: c.moneda,
          numero: c.numero,
          cci: c.cci || '',
          titular: c.titular || '',
          activa: c.activa,
          orden: c.orden
        });
        cuentasMap.set(c.empresa_id, list);
      }
    }
    return empresas.map(e => ({
      ...e,
      cuentas_bancarias: cuentasMap.get(e.id) ?? []
    }));
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
      .select('id, folio, fecha, empresa_id, cliente_id, cliente_nombre, cliente_documento, cliente_telefono, cliente_direccion, cliente_correo, subtotal, igv, total, estado, items, vendedor, lugar_entrega, observaciones, oculta')
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

  async guardarCotizacion(cotizacion: ICotizacion): Promise<ICotizacion> {
    const payload: any = { ...cotizacion };
    if (!payload.id || payload.id === '') delete payload.id;
    if (!payload.created_at || payload.created_at === '') delete payload.created_at;
    if (!payload.cliente_id || (typeof payload.cliente_id === 'string' && payload.cliente_id.trim() === '')) {
      payload.cliente_id = null;
    }

    const { data, error } = await this.client
      .from('cotizaciones').insert([payload]).select().single();
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

  async actualizarVisibilidadCotizacion(id: string, oculta: boolean): Promise<void> {
    const { error } = await this.client
      .from('cotizaciones')
      .update({ oculta })
      .eq('id', id);
    if (error) throw error;
  }

  async obtenerSiguienteFolio(empresaId: string, prefijoFallback?: string): Promise<string> {
    const { data, error } = await this.client.rpc('getnextfolioempresa', {
      empresaid: empresaId
    });

    if (error || !data) {
      console.error('Error al obtener folio:', error);
      const prefijo = (prefijoFallback || (empresaId || 'EMP').substring(0, 3)).toUpperCase();
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

  /** Carga cuentas desde la tabla cuentas_bancarias (ya no vienen embebidas en empresas). */
  async enriquecerConCuentasBancarias(empresa: IEmpresa): Promise<IEmpresa> {
    if (!empresa?.id) return empresa;
    try {
      const cuentasDB = await this.getCuentasBancarias(empresa.id);
      return {
        ...empresa,
        cuentas_bancarias: cuentasDB.map((c: any): ICuentaBancaria => ({
          banco: c.banco,
          tipo_cuenta: c.tipo_cuenta,
          moneda: c.moneda,
          numero: c.numero,
          cci: c.cci || '',
          titular: c.titular || '',
          activa: c.activa,
          orden: c.orden
        }))
      };
    } catch {
      return { ...empresa, cuentas_bancarias: empresa.cuentas_bancarias ?? [] };
    }
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

  async obtenerPerfil(userId?: string): Promise<{ rol: string } | null> {
    const id = userId || (await this.obtenerUsuarioActual())?.id;
    if (!id) return null;

    const { data, error } = await this.client
      .from('profiles').select('rol').eq('id', id).single();

    if (error) return null;
    return data;
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
      .from('profiles').select('id, email, rol, activo').order('rol');
    if (error) throw error;
    return data || [];
  }

  async crearUsuario(email: string, password: string, rol: string = 'vendedor'): Promise<any> {
    const { data, error } = await this.client.rpc('admin_crear_usuario', {
      p_email: email,
      p_password: password,
      p_rol: rol
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
    const { error } = await this.client.rpc('admin_eliminar_usuario', { p_user_id: id });
    if (error) {
      const { error: profErr } = await this.client
        .from('profiles').delete().eq('id', id);
      if (profErr) throw profErr;
    }
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

  // ─── MAQUINARIA & HOROMETRO ───────────────────────────────────────────────

  async getMaquinaria(empresaId: string, soloActivas = false): Promise<IMaquinaria[]> {
    let query = this.client
      .from('maquinaria')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre');

    if (soloActivas) {
      query = query.eq('activa', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as IMaquinaria[];
  }

  async guardarMaquinaria(maquina: IMaquinaria): Promise<IMaquinaria> {
    const {
      horas_desde_mantenimiento,
      horas_restantes,
      porcentaje_progreso,
      estado_mantenimiento,
      ...payload
    } = maquina as any;

    if (!payload.id || payload.id === '') delete payload.id;
    if (!payload.created_at || payload.created_at === '') delete payload.created_at;

    if (maquina.id) {
      const { data, error } = await this.client
        .from('maquinaria')
        .update(payload)
        .eq('id', maquina.id)
        .select()
        .single();
      if (error) throw error;
      return data as IMaquinaria;
    } else {
      const { data, error } = await this.client
        .from('maquinaria')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      return data as IMaquinaria;
    }
  }

  async eliminarMaquinaria(id: string): Promise<void> {
    const { error } = await this.client.from('maquinaria').delete().eq('id', id);
    if (error) throw error;
  }

  async getLecturasHorometro(maquinaId: string, limit = 20): Promise<ILecturaHorometro[]> {
    const { data, error } = await this.client
      .from('lecturas_horometro')
      .select('*')
      .eq('maquina_id', maquinaId)
      .order('fecha_lectura', { ascending: false })
      .order('horometro', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as ILecturaHorometro[];
  }

  async guardarLecturaHorometro(lectura: ILecturaHorometro): Promise<ILecturaHorometro> {
    const payload: any = { ...lectura };
    if (!payload.id || payload.id === '') delete payload.id;
    if (!payload.created_at || payload.created_at === '') delete payload.created_at;

    if (lectura.id) {
      const { data, error } = await this.client
        .from('lecturas_horometro')
        .update(payload)
        .eq('id', lectura.id)
        .select()
        .single();
      if (error) throw error;
      return data as ILecturaHorometro;
    } else {
      const { data, error } = await this.client
        .from('lecturas_horometro')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      return data as ILecturaHorometro;
    }
  }

  async eliminarLecturaHorometro(id: string): Promise<void> {
    const { error } = await this.client.from('lecturas_horometro').delete().eq('id', id);
    if (error) throw error;
  }

  async recalcularHorometroMaquina(maquinaId: string): Promise<void> {
    const { data } = await this.client
      .from('lecturas_horometro')
      .select('horometro, tipo_evento')
      .eq('maquina_id', maquinaId)
      .order('horometro', { ascending: false })
      .limit(1);

    if (!data || data.length === 0) return;
    const maxLectura = data[0].horometro;
    const updateData: any = { horometro_actual: maxLectura };

    const { data: ultimoMant } = await this.client
      .from('lecturas_horometro')
      .select('horometro')
      .eq('maquina_id', maquinaId)
      .eq('tipo_evento', 'mantenimiento')
      .order('horometro', { ascending: false })
      .limit(1);

    if (ultimoMant && ultimoMant.length > 0) {
      updateData.ultimo_mantenimiento = ultimoMant[0].horometro;
    }

    await this.client
      .from('maquinaria')
      .update(updateData)
      .eq('id', maquinaId);
  }
}

