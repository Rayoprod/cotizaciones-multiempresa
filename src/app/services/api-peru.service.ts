import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface IDatosDocumento {
  tipo: 'dni' | 'ruc';
  numero: string;
  nombre: string;
  direccion: string;
}

/**
 * Consulta DNI/RUC a través de la función /api/consulta-documento (Vercel).
 * El token de Decolecta vive en el servidor; aquí solo viaja la sesión del usuario.
 */
@Injectable({ providedIn: 'root' })
export class ApiPeruService {

  // El plan de Decolecta tiene pocas consultas: no repetir un número ya consultado.
  private cache = new Map<string, IDatosDocumento>();

  constructor(private supabase: SupabaseService) {}

  async buscarDocumento(documento: string): Promise<IDatosDocumento> {
    const doc = documento.trim();
    if (!/^\d{8}$|^\d{11}$/.test(doc)) {
      throw new Error('El DNI debe tener 8 dígitos y el RUC 11.');
    }

    const enCache = this.cache.get(doc);
    if (enCache) return enCache;

    const { data } = await this.supabase.obtenerSesion();
    const token = data.session?.access_token;
    if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');

    const respuesta = await fetch(`/api/consulta-documento?numero=${doc}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const cuerpo = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      throw new Error(cuerpo?.message || `No se encontraron datos para ${doc}.`);
    }
    this.cache.set(doc, cuerpo as IDatosDocumento);
    return cuerpo as IDatosDocumento;
  }
}
