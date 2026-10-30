/** Color de acento cuando la empresa no tiene uno válido (o no hay empresa activa). */
export const ACENTO_POR_DEFECTO = '#0284c7';

/** Contraste mínimo del acento contra el blanco (WCAG AA para texto normal). */
const CONTRASTE_MINIMO = 4.5;

type Rgb = [number, number, number];

const NEGRO: Rgb = [0, 0, 0];
const BLANCO: Rgb = [255, 255, 255];

function hexARgb(color: string | null | undefined): Rgb | null {
  const limpio = String(color ?? '').trim().replace(/^#/, '');
  const completo = /^[0-9a-f]{3}$/i.test(limpio) ? limpio.replace(/./g, c => c + c) : limpio;
  if (!/^[0-9a-f]{6}$/i.test(completo)) return null;
  return [0, 2, 4].map(i => parseInt(completo.slice(i, i + 2), 16)) as Rgb;
}

function rgbAHex(rgb: Rgb): string {
  return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function mezclar(a: Rgb, b: Rgb, proporcionDeB: number): Rgb {
  return a.map((v, i) => v + (b[i] - v) * proporcionDeB) as Rgb;
}

/** Luminancia relativa según WCAG. */
function luminancia(rgb: Rgb): number {
  const [r, g, b] = rgb.map(v => {
    const canal = v / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste de un color contra el blanco (de 1 a 21). */
export function contrasteConBlanco(color: string): number {
  const rgb = hexARgb(color);
  return rgb ? 1.05 / (luminancia(rgb) + 0.05) : 1;
}

/**
 * Variables CSS del acento de una empresa. Los botones llevan texto blanco y los
 * enlaces van sobre blanco, así que un color claro se oscurece hasta que se lea.
 * El color original se sigue usando donde es decoración (cabecera, logo, PDF).
 */
export function paletaDeAcento(color: string | null | undefined): Record<string, string> {
  let acento = hexARgb(color) ?? hexARgb(ACENTO_POR_DEFECTO)!;
  while (1.05 / (luminancia(acento) + 0.05) < CONTRASTE_MINIMO) {
    acento = mezclar(acento, NEGRO, 0.04);
  }
  const hex = rgbAHex(acento);
  return {
    '--acento': hex,
    '--acento-hover': rgbAHex(mezclar(acento, NEGRO, 0.12)),
    '--acento-fuerte': rgbAHex(mezclar(acento, NEGRO, 0.28)),
    '--acento-suave': rgbAHex(mezclar(acento, BLANCO, 0.92)),
    '--acento-borde': rgbAHex(mezclar(acento, BLANCO, 0.7)),
    '--acento-anillo': rgbAHex(mezclar(acento, BLANCO, 0.75)),
    // Las usa PrimeNG y lo que ya estaba escrito con estos nombres.
    '--primary-color': hex,
    '--p-primary-color': hex,
    '--p-primary-hover': rgbAHex(mezclar(acento, NEGRO, 0.12))
  };
}
