import { Injectable, signal, computed } from '@angular/core';
import { IFotoCantera, ISalidaDeHoy, ISalidaLocal, esRechazoDefinitivo, fechaIso, normalizarPlaca } from '../models';
import { AlmacenCampoService } from './almacen-campo';
import { EmpresasUsuarioService } from './empresas-usuario.service';
import { SessionContextService } from './session-context.service';
import { SupabaseService } from './supabase.service';

/** Con señal débil un pedido se puede quedar colgado y trabaría toda la cola. */
const LIMITE_PEDIDO_MS = 30 * 1000;
const REINTENTAR_MS = 60 * 1000;
/** Cada cuánto se baja una copia nueva aunque no haya nada que enviar: trae las ventas nuevas. */
const REFRESCAR_MS = 10 * 60 * 1000;
/** Lo ya enviado se guarda unos días: sirve para la lista de hoy y para calcular lo que falta. */
const DIAS_DE_ENVIADAS = 3;

export function conLimite<T>(pedido: PromiseLike<T>, ms: number = LIMITE_PEDIDO_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const reloj = setTimeout(() => reject(new Error('El pedido tardó demasiado.')), ms);
    pedido.then(
      valor => { clearTimeout(reloj); resolve(valor); },
      error => { clearTimeout(reloj); reject(error); }
    );
  });
}

export type NuevaSalida = Pick<ISalidaLocal,
  'venta_id' | 'venta_item_id' | 'folio_venta' | 'cliente' | 'producto_id' | 'material' | 'unidad' | 'cantidad' | 'placa' | 'chofer' | 'guia'>;

/**
 * Todo lo que se anota en la cantera se guarda primero en el celular y se envía
 * cuando hay señal, en orden. Un rechazo queda marcado y no detiene a las demás; un
 * problema de conexión sí, porque las siguientes fallarían igual.
 */
@Injectable({ providedIn: 'root' })
export class ColaCampoService {

  private _locales = signal<ISalidaLocal[]>([]);
  private _foto = signal<IFotoCantera | null>(null);
  private _sincronizando = signal(false);
  private _fallo = signal(false);
  private _listo = signal(false);

  /** De la cuenta y la empresa actuales. */
  readonly locales = this._locales.asReadonly();
  readonly foto = this._foto.asReadonly();
  readonly sincronizando = this._sincronizando.asReadonly();
  /** El último intento no llegó al servidor. Se vuelve a intentar solo. */
  readonly fallo = this._fallo.asReadonly();
  /** Ya se leyó lo guardado en el celular. */
  readonly listo = this._listo.asReadonly();

  readonly porEnviar = computed(() => this._locales().filter(s => s.envio === 'pendiente' || s.anulacion?.envio === 'pendiente').length);
  readonly conProblema = computed(() => this._locales().filter(s => s.envio === 'con_problema' || s.anulacion?.envio === 'con_problema').length);

  private reloj: ReturnType<typeof setInterval> | null = null;
  private alCambiarConexion = () => this.sincronizar();
  private alVolverALaApp = () => {
    if (document.visibilityState === 'visible') this.sincronizar();
  };

  constructor(
    private almacen: AlmacenCampoService,
    private supabase: SupabaseService,
    private session: SessionContextService,
    private empresasUsuario: EmpresasUsuarioService
  ) {}

  private get usuarioId(): string | null {
    return this.session.usuario()?.id ?? null;
  }

  private get empresaId(): string | null {
    return this.session.empresaActiva()?.id ?? null;
  }

  // ─── Arrancar y parar ─────────────────────────────────────────────────────

  /** Lee lo guardado y empieza a enviar. Lo guardado se ve aunque no haya señal. */
  async iniciar(): Promise<void> {
    this.detener();
    await this.leerDelCelular();
    this._listo.set(true);

    window.addEventListener('online', this.alCambiarConexion);
    document.addEventListener('visibilitychange', this.alVolverALaApp);
    this.reloj = setInterval(() => this.sincronizar(), REINTENTAR_MS);
    this.sincronizar(true);
  }

  detener(): void {
    window.removeEventListener('online', this.alCambiarConexion);
    document.removeEventListener('visibilitychange', this.alVolverALaApp);
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
  }

  private async leerDelCelular(): Promise<void> {
    const usuario = this.usuarioId;
    const empresa = this.empresaId;
    const todas = await this.almacen.listar<ISalidaLocal>('salidas');
    const limite = fechaIso(new Date(Date.now() - DIAS_DE_ENVIADAS * 86400000));
    const quedan: ISalidaLocal[] = [];
    for (const salida of todas) {
      const terminada = salida.envio === 'enviada' && (!salida.anulacion || salida.anulacion.envio === 'enviada');
      if (terminada && salida.fecha < limite) {
        await this.almacen.borrar('salidas', salida.id);
      } else if (salida.usuario_id === usuario && salida.empresa_id === empresa) {
        quedan.push(salida);
      }
    }
    this._locales.set(quedan);
    this._foto.set(empresa ? await this.almacen.leer<IFotoCantera>('fotos', empresa) : null);
  }

  // ─── Anotar ───────────────────────────────────────────────────────────────

  private turno: Promise<unknown> = Promise.resolve();

  /**
   * Leer, cambiar y guardar una salida, de una en una. Si no, anularla justo mientras
   * se envía perdería la anulación: el envío la escribiría encima.
   */
  private cambiarFila(id: string, cambio: (fila: ISalidaLocal | null) => ISalidaLocal | null): Promise<ISalidaLocal | null> {
    const paso = this.turno.then(async () => {
      const fila = cambio(await this.almacen.leer<ISalidaLocal>('salidas', id));
      if (!fila) return null;
      await this.almacen.guardar('salidas', fila);
      if (fila.usuario_id === this.usuarioId && fila.empresa_id === this.empresaId) {
        this._locales.update(lista => [...lista.filter(s => s.id !== id), fila]);
      }
      return fila;
    });
    this.turno = paso.catch(() => undefined);
    return paso;
  }

  /** Termina cuando la salida ya está en el disco del celular. */
  async registrar(nueva: NuevaSalida): Promise<ISalidaLocal> {
    const usuario = this.session.usuario();
    const empresa = this.empresaId;
    if (!usuario || !empresa) throw new Error('No hay sesión en este celular.');
    const ahora = new Date();
    const salida: ISalidaLocal = {
      ...nueva,
      id: crypto.randomUUID(),
      empresa_id: empresa,
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre || usuario.email || null,
      placa: normalizarPlaca(nueva.placa),
      fecha: fechaIso(ahora),
      registrada_en: ahora.toISOString(),
      envio: 'pendiente'
    };
    await this.cambiarFila(salida.id, () => salida);
    this.sincronizar();
    return salida;
  }

  /** Si llegó de otro celular se copia aquí, para poder enviar la anulación sin señal. */
  async anular(id: string, motivo: string, delServidor?: ISalidaDeHoy): Promise<void> {
    const usuario = this.session.usuario();
    const empresa = this.empresaId;
    await this.cambiarFila(id, fila => {
      let salida = fila;
      if (!salida && delServidor && usuario && empresa) {
        salida = {
          id, empresa_id: empresa, usuario_id: usuario.id, usuario_nombre: delServidor.creado_por_nombre,
          venta_id: delServidor.venta_id, venta_item_id: delServidor.venta_item_id, folio_venta: delServidor.folio_venta,
          cliente: delServidor.cliente, producto_id: null, material: delServidor.material, unidad: delServidor.unidad,
          cantidad: Number(delServidor.cantidad), placa: delServidor.placa, chofer: delServidor.chofer, guia: delServidor.guia,
          fecha: delServidor.fecha, registrada_en: delServidor.registrada_en,
          envio: 'enviada', enviada_en: this._foto()?.pedida_en
        };
      }
      if (!salida || salida.anulacion) return null;
      return { ...salida, anulacion: { motivo, anulada_en: new Date().toISOString(), envio: 'pendiente' } };
    });
    this.sincronizar();
  }

  /** Vuelve a intentar lo que el servidor rechazó, por si ya se corrigió la causa. */
  async reintentar(id: string): Promise<void> {
    await this.cambiarFila(id, fila => fila && {
      ...fila,
      envio: fila.envio === 'con_problema' ? 'pendiente' : fila.envio,
      problema: fila.envio === 'con_problema' ? undefined : fila.problema,
      anulacion: fila.anulacion?.envio === 'con_problema'
        ? { ...fila.anulacion, envio: 'pendiente', problema: undefined }
        : fila.anulacion
    });
    this.sincronizar();
  }

  // ─── Enviar y bajar ───────────────────────────────────────────────────────

  private intentando = false;
  private repetir = false;
  private bajadaEn = 0;

  /**
   * Envía lo pendiente y baja una copia nueva. Se puede llamar en cualquier momento:
   * si ya está corriendo, no hace nada. `navigator.onLine` solo se usa para no gastar
   * batería: cuando dice que hay señal puede ser mentira, y entonces falla el pedido.
   */
  async sincronizar(forzar = false): Promise<void> {
    if (this.intentando) {
      this.repetir = true;
      return;
    }
    if (!forzar && !navigator.onLine) return;
    const hayPendientes = this.porEnviar() > 0;
    const copiaVieja = Date.now() - this.bajadaEn >= REFRESCAR_MS;
    if (!forzar && !hayPendientes && !copiaVieja) return;

    this.intentando = true;
    this._sincronizando.set(true);
    try {
      const sinCortes = await this.enviarPendientes();
      if (sinCortes) await this.bajarDatos();
      this._fallo.set(!sinCortes);
    } catch (e) {
      console.warn('No se pudo sincronizar con el servidor:', e);
      this._fallo.set(true);
    } finally {
      this.intentando = false;
      this._sincronizando.set(false);
    }
    // Lo anotado mientras se enviaba no iba en esta vuelta.
    if (this.repetir) {
      this.repetir = false;
      this.sincronizar();
    }
  }

  /** Devuelve false si se cortó por un problema de conexión. */
  private async enviarPendientes(): Promise<boolean> {
    const usuario = this.usuarioId;
    if (!usuario) return false;
    // De esta cuenta en cualquier empresa: pudo haber cambiado de empresa sin señal.
    const todas = await this.almacen.listar<ISalidaLocal>('salidas');
    const pendientes = todas
      .filter(s => s.usuario_id === usuario && (s.envio === 'pendiente' || s.anulacion?.envio === 'pendiente'))
      .sort((a, b) => a.registrada_en.localeCompare(b.registrada_en));

    for (const { id } of pendientes) {
      let salida = await this.almacen.leer<ISalidaLocal>('salidas', id);
      if (salida?.envio === 'pendiente') {
        const pedido = salida;
        const envio = await this.enviar(() => this.supabase.registrarSalida(pedido));
        if (envio === 'corte') return false;
        salida = await this.cambiarFila(id, fila => fila && (envio === 'ok'
          ? { ...fila, envio: 'enviada', enviada_en: new Date().toISOString(), problema: undefined }
          : { ...fila, envio: 'con_problema', problema: envio.problema }));
      }
      // Una que el servidor rechazó no existe allá: su anulación no tiene a qué aplicarse.
      if (salida?.envio === 'enviada' && salida.anulacion?.envio === 'pendiente') {
        const { motivo, anulada_en } = salida.anulacion;
        const envio = await this.enviar(() => this.supabase.anularSalida(id, motivo, anulada_en));
        if (envio === 'corte') return false;
        await this.cambiarFila(id, fila => fila?.anulacion ? {
          ...fila,
          anulacion: envio === 'ok'
            ? { ...fila.anulacion, envio: 'enviada', enviada_en: new Date().toISOString(), problema: undefined }
            : { ...fila.anulacion, envio: 'con_problema', problema: envio.problema }
        } : fila);
      }
    }
    return true;
  }

  private async enviar(pedido: () => PromiseLike<unknown>): Promise<'ok' | 'corte' | { problema: string }> {
    try {
      await conLimite(pedido());
      return 'ok';
    } catch (e: any) {
      if (esRechazoDefinitivo(e)) return { problema: e?.message || 'El servidor no la aceptó.' };
      console.warn('Envío interrumpido; se reintenta luego:', e);
      return 'corte';
    }
  }

  private async bajarDatos(): Promise<void> {
    const empresa = this.empresaId;
    if (!empresa) return;
    // Antes de pedir: lo enviado hasta aquí ya viene incluido en lo que llegue.
    const pedidaEn = new Date().toISOString();
    const datos = await conLimite(this.supabase.datosCantera(empresa));
    const foto: IFotoCantera = { empresa_id: empresa, pedida_en: pedidaEn, datos };
    await this.almacen.guardar('fotos', foto);
    this._foto.set(foto);
    this.bajadaEn = Date.now();

    // El rol o los módulos pudieron cambiar. Si esto falla, lo anterior ya sirvió.
    try {
      await conLimite(this.empresasUsuario.obtener(true));
      if (this.session.modoCampo()) this.session.activarModoCampo();
    } catch (e) {
      console.warn('No se pudieron refrescar las empresas:', e);
    }
  }
}
