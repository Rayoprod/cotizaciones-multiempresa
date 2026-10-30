/**
 * Utilidades para logos y firmas: se achican antes de subirlos porque el PDF
 * los dibuja a ~110 px y una imagen de varios MB solo engorda cada PDF.
 */

/** Lado mayor máximo, en píxeles, de un logo o firma. */
export const LADO_MAXIMO_IMAGEN = 800;

/** Mismo límite que el bucket `empresas`. */
export const PESO_MAXIMO_IMAGEN = 2 * 1024 * 1024;

/** Reduce la imagen a LADO_MAXIMO_IMAGEN conservando transparencia (PNG) o como JPEG. */
export async function prepararImagen(archivo: Blob, ladoMaximo = LADO_MAXIMO_IMAGEN): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const tipo = archivo.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';

  if (escala === 1 && archivo.size <= PESO_MAXIMO_IMAGEN / 4 && archivo.type === tipo) {
    bitmap.close();
    return archivo;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.')), tipo, 0.9)
  );
}

export function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result as string);
    lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    lector.readAsDataURL(blob);
  });
}

export async function dataUrlABlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export function extensionDeImagen(tipo: string): string {
  return tipo === 'image/jpeg' ? 'jpg' : tipo === 'image/webp' ? 'webp' : 'png';
}
