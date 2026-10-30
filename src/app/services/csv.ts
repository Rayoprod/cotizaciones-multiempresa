/** Descarga filas como CSV. El BOM hace que Excel respete las tildes. */
export function descargarCsv(nombreArchivo: string, encabezados: string[], filas: unknown[][]) {
  const contenido = [encabezados, ...filas]
    .map(fila => fila.map(celda => `"${String(celda ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
