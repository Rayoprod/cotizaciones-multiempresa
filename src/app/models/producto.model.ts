// src/app/models/producto.model.ts

export interface IProducto {
  id?: string;
  codigo_sku: string;
  descripcion: string;
  unidad?: string;
  precio_unitario_base: number;
  created_at?: string;
  empresa_id: string;
}

/** Unidades que se ofrecen al cotizar. `value` es lo que se guarda y sale en el PDF. */
export const UNIDADES_COMUNES: Array<{ value: string; label: string }> = [
  { value: 'm3', label: 'm³' },
  { value: 'und', label: 'und' },
  { value: 'bolsa', label: 'bolsa' },
  { value: 'viaje', label: 'viaje' },
  { value: 'hora', label: 'hora' },
  { value: 'día', label: 'día' },
  { value: 'mes', label: 'mes' },
  { value: 'glb', label: 'glb' }
];

/** Un flete o un alquiler no sale de la cantera. Mismo criterio que es_unidad_de_servicio(). */
export function esUnidadDeServicio(unidad: string | null | undefined): boolean {
  return ['viaje', 'hora', 'día', 'dia', 'mes', 'glb'].includes(String(unidad ?? '').trim().toLowerCase());
}

export function esUnidadDeVolumen(unidad: string | null | undefined): boolean {
  return ['m3', 'm³'].includes(String(unidad ?? '').trim().toLowerCase());
}

/** La unidad más usada en el catálogo de la empresa: con ella abre una línea nueva. */
export function unidadMasUsada(productos: Array<Pick<IProducto, 'unidad'>>): string {
  const cuenta = new Map<string, number>();
  for (const { unidad } of productos) {
    const limpia = String(unidad ?? '').trim();
    if (limpia) cuenta.set(limpia, (cuenta.get(limpia) ?? 0) + 1);
  }
  let elegida = 'm3';
  let mayor = 0;
  for (const [unidad, veces] of cuenta) {
    if (veces > mayor) {
      elegida = unidad;
      mayor = veces;
    }
  }
  return elegida;
}

/** Siguiente código PRD-0000 libre en el catálogo de la empresa. */
export function siguienteSkuProducto(productos: Array<Pick<IProducto, 'codigo_sku'>>): string {
  const usados = new Set(productos.map(p => String(p.codigo_sku ?? '').trim().toLowerCase()));
  const numeros = productos.map(p => {
    const coincidencia = String(p.codigo_sku ?? '').match(/PRD-(\d+)/i);
    return coincidencia ? parseInt(coincidencia[1], 10) : 0;
  });
  let siguiente = Math.max(0, ...numeros) + 1;
  while (usados.has(`prd-${String(siguiente).padStart(4, '0')}`)) siguiente++;
  return `PRD-${String(siguiente).padStart(4, '0')}`;
}
