import { Injectable } from '@angular/core';

const BASE = 'salidas_cantera';
const VERSION = 1;
/** La de la prueba sin señal: nada de lo anotado ahí era una salida real. */
const BASE_DE_PRUEBA = 'cantera';

export type TablaCampo = 'salidas' | 'fotos';

/**
 * Lo que el celular de cantera guarda para trabajar sin señal. Va en IndexedDB y
 * no en localStorage: aguanta miles de registros y escribir no traba la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class AlmacenCampoService {

  private base: Promise<IDBDatabase> | null = null;

  private abrir(): Promise<IDBDatabase> {
    this.base ??= new Promise((resolve, reject) => {
      const pedido = indexedDB.open(BASE, VERSION);
      pedido.onupgradeneeded = () => {
        pedido.result.createObjectStore('salidas', { keyPath: 'id' });
        pedido.result.createObjectStore('fotos', { keyPath: 'empresa_id' });
        indexedDB.deleteDatabase(BASE_DE_PRUEBA);
      };
      pedido.onsuccess = () => {
        // Una versión nueva de la app no debe quedar esperando a esta pestaña.
        pedido.result.onversionchange = () => {
          pedido.result.close();
          this.base = null;
        };
        resolve(pedido.result);
      };
      pedido.onerror = () => {
        this.base = null;
        reject(pedido.error);
      };
    });
    return this.base;
  }

  /** Termina cuando ya está en disco: si se apaga el celular justo después, no se pierde. */
  async guardar<T>(tabla: TablaCampo, fila: T): Promise<void> {
    const base = await this.abrir();
    return new Promise((resolve, reject) => {
      const transaccion = base.transaction(tabla, 'readwrite', { durability: 'strict' });
      transaccion.objectStore(tabla).put(fila);
      transaccion.oncomplete = () => resolve();
      transaccion.onerror = () => reject(transaccion.error);
      transaccion.onabort = () => reject(transaccion.error);
    });
  }

  async listar<T>(tabla: TablaCampo): Promise<T[]> {
    const base = await this.abrir();
    return new Promise((resolve, reject) => {
      const pedido = base.transaction(tabla, 'readonly').objectStore(tabla).getAll();
      pedido.onsuccess = () => resolve(pedido.result as T[]);
      pedido.onerror = () => reject(pedido.error);
    });
  }

  async leer<T>(tabla: TablaCampo, clave: string): Promise<T | null> {
    const base = await this.abrir();
    return new Promise((resolve, reject) => {
      const pedido = base.transaction(tabla, 'readonly').objectStore(tabla).get(clave);
      pedido.onsuccess = () => resolve((pedido.result as T) ?? null);
      pedido.onerror = () => reject(pedido.error);
    });
  }

  async borrar(tabla: TablaCampo, clave: string): Promise<void> {
    const base = await this.abrir();
    return new Promise((resolve, reject) => {
      const transaccion = base.transaction(tabla, 'readwrite');
      transaccion.objectStore(tabla).delete(clave);
      transaccion.oncomplete = () => resolve();
      transaccion.onerror = () => reject(transaccion.error);
    });
  }
}
