import { Injectable } from '@angular/core';
import { IEmpresa } from '../models';
import { SupabaseService } from './supabase.service';
import { SessionContextService } from './session-context.service';

/** Cuánto se reutiliza la última carga antes de volver a pedirla. */
const VIGENCIA_MS = 60 * 1000;

/**
 * Empresas del usuario actual (con su rol y cuentas), compartidas por el
 * selector, los layouts y los guards. Cada pedido a la BD tarda cientos de
 * milisegundos, así que se reutiliza la carga reciente y la que está en curso.
 */
@Injectable({ providedIn: 'root' })
export class EmpresasUsuarioService {

  private enCurso: Promise<IEmpresa[]> | null = null;
  private cargadasEn = 0;
  private cargadasPara: string | null = null;

  constructor(
    private supabase: SupabaseService,
    private session: SessionContextService
  ) {}

  async obtener(forzar = false): Promise<IEmpresa[]> {
    if (this.enCurso) return this.enCurso;
    const usuarioId = this.session.usuario()?.id ?? null;
    const vigente = usuarioId === this.cargadasPara && Date.now() - this.cargadasEn < VIGENCIA_MS;
    if (!forzar && vigente) return this.session.empresas();

    this.enCurso = this.supabase.getEmpresasDelUsuario()
      .then(empresas => {
        this.session.setEmpresas(empresas);
        this.cargadasEn = Date.now();
        this.cargadasPara = usuarioId;
        // La empresa activa guardada en sessionStorage puede tener un rol, un
        // logo o unas opciones que ya cambiaron.
        const activa = this.session.empresaActiva();
        const actualizada = activa && empresas.find(e => e.id === activa.id);
        if (actualizada) this.session.setEmpresaActiva(actualizada);
        return empresas;
      })
      .finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  /** La próxima llamada a obtener() vuelve a consultar la BD. */
  invalidar(): void {
    this.cargadasEn = 0;
  }
}
