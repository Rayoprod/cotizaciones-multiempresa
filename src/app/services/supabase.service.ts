import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { ICotizacion } from '../models/cotizacion.model';
import { IEmpresa } from '../models/empresa.model';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // Obtener todas las empresas registradas
  async getEmpresas() {
    const { data, error } = await this.supabase
      .from('empresas')
      .select('*')
      .order('id'); 
      
    if (error) throw error;
    return data as IEmpresa[];
  }

  // Obtener todas las cotizaciones para el historial
  async getHistorial() {
    const { data, error } = await this.supabase
      .from('cotizaciones')
      .select('*')
      .order('fecha', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  // Guardar una nueva cotización
  async guardarCotizacion(cotizacion: ICotizacion) {
    const { data, error } = await this.supabase
      .from('cotizaciones')
      .insert([cotizacion]);
    
    if (error) throw error;
    return data;
  }

  // Obtener catálogo de productos
  async getProductos() {
    const { data, error } = await this.supabase.from('productos').select('*').order('descripcion');
    if (error) throw error;
    return data || [];
  }

  // Obtener catálogo de clientes
  async getClientes() {
    const { data, error } = await this.supabase.from('clientes').select('*').order('nombre_razon_social');
    if (error) throw error;
    return data || [];
  }

  // Guardar un cliente nuevo de forma silenciosa
  // Crear o Actualizar un cliente
  async guardarCliente(cliente: any) {
    if (cliente.id) {
      // Actualizar existente
      const { data, error } = await this.supabase
        .from('clientes')
        .update(cliente)
        .eq('id', cliente.id)
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      // Crear nuevo
      const { data, error } = await this.supabase
        .from('clientes')
        .insert([cliente])
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    }
  }

  // Eliminar un cliente
  async eliminarCliente(id: string) {
    const { error } = await this.supabase
      .from('clientes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // Actualizar el estado de una cotización (Ej: De PENDIENTE a APROBADA)
  async actualizarEstado(id: string, nuevoEstado: string) {
    const { data, error } = await this.supabase
      .from('cotizaciones')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data;
  }

  // Crear o Actualizar un producto
  async guardarProducto(producto: any) {
    if (producto.id) {
      // Si tiene ID, lo actualizamos
      const { data, error } = await this.supabase
        .from('productos')
        .update(producto)
        .eq('id', producto.id)
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    } else {
      // Si no tiene ID, es uno nuevo
      const { data, error } = await this.supabase
        .from('productos')
        .insert([producto])
        .select();
      if (error) throw error;
      return data ? data[0] : null;
    }
  }

  // Eliminar un producto
  async eliminarProducto(id: string) {
    const { error } = await this.supabase
      .from('productos')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // Agrega esto dentro de tu clase SupabaseService
async iniciarSesion(email: string, password: string) {
  return await this.supabase.auth.signInWithPassword({ email, password });
}

// Obtener el siguiente folio secuencial dependiento de la empresa
  async obtenerSiguienteFolio(empresaId: string) {
    const { data, error } = await this.supabase.rpc('get_next_folio_empresa', { empresa_id: empresaId });
    if (error) {
      console.error("Error al obtener folio:", error);
      // Fallback de emergencia por si algo falla, usa la hora para que el vendedor no se quede bloqueado
      return `COT-${empresaId}-${new Date().getTime()}`; 
    }
    return data;
  }

  // Actualizar datos de una empresa existente
  async actualizarEmpresa(id: string, datos: any) {
    const { data, error } = await this.supabase
      .from('empresas')
      .update(datos)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data;
  }

  // Crear una nueva empresa desde cero
  async crearEmpresa(nuevaEmpresa: any) {
    const { data, error } = await this.supabase
      .from('empresas')
      .insert([nuevaEmpresa])
      .select();
    
    if (error) throw error;
    return data;
  }
  
}