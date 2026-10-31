import { Injectable } from '@angular/core';

const BASE = 'cantera';
const VERSION = 1;

export type TablaCampo = 'pruebas';

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
        if (!pedido.result.objectStoreNames.contains('pruebas')) {
          pedido.result.createObjectStore('pruebas', { keyPath: 'id' });
        }
      };
      pedido.onsuccess = () => resolve(pedido.result);
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
}
