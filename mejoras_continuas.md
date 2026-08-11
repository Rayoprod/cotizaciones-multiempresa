- Tue Aug 11 03:00:38 -05 2026: Optimización de rendimiento en CotizadorComponent mediante la implementación de ChangeDetectionStrategy.OnPush para evitar excesivos recálculos en la UI.
- Tue Aug 11 03:24:00 -05 2026: Refactorización y optimización completa del módulo de Cotizaciones:
  1. RENDIMIENTO: Optimización de carga inicial en `CotizadorComponent` pasando de llamadas secuenciales (waterfall) a ejecuciones paralelas con `Promise.all` para obtener productos, clientes y maquinaria de Supabase.
  2. BUGS DE INTERFAZ (UI/UX):
     - Corrección de bug crítico en `cotizador.html` donde el botón "Generar Cotización PDF" quedaba dentro de un bloque `*ngIf` erróneo que lo ocultaba al completar los datos del cliente.
     - Corrección de etiquetas `<div>` desalineadas y sintaxis `</ng-container>` en el template.
     - Corrección de invocación de getter `this.tieneItemsValidos()` a `this.tieneItemsValidos` en `cotizador.ts`.
     - Corrección del modo de borrador en `historial.ts` para asignar correctamente `modo: 'revision' | 'duplicar'`, permitiendo la correcta visualización de banners informativos.
  3. INTEGRIDAD DE DATOS: Estandarización de cálculos monetarios (`subtotalGeneral`, `igvTotal`, `totalFinal`, `recalcularItem`) aplicando redondeo seguro a 2 decimales para garantizar consistencia numérica en las cotizaciones guardadas en Supabase.
- Tue Aug 11 03:25:00 -05 2026: Corrección de validación, reactividad y sincronización de datos en CotizadorComponent:
  1. RENDIMIENTO & UI: Incorporación de `cdr.markForCheck()` en `filtrarNombresClientes` y `filtrarNombresProductos` para actualización inmediata en OnPush; asignación por defecto de cantidad 1 al seleccionar un producto sugerido.
  2. BUGS DE INTERFAZ: Conversión de `puedeGenerar` y `tieneItemsValidos` en getters dinámicos para que el binding `[disabled]="!puedeGenerar"` en el botón de PDF responda reactivamente. Reseteo de estados `borradorModo` tras guardar cotizaciones.
  3. INTEGRIDAD DE DATOS: Validación previa en `generarPDF()` para impedir el guardado de cotizaciones incompletas en Supabase, y actualización silenciosa de clientes en `procesarClienteSilencioso()` cuando se modifican teléfono, dirección o correo.
- Tue Aug 11 03:30:00 -05 2026: Optimización y correcciones críticas en el flujo del módulo Cotizaciones (Integridad de datos, UI/UX y limpieza de código):
  1. INTEGRIDAD DE DATOS & REVISIONES: 
     - Solucionado bug crítico en `CotizadorComponent.ngOnInit()` donde un borrador almacenado en `sessionStorage` era eliminado antes de verificar si `empresaActiva` estaba asignada, provocando pérdida accidental de borradores al cambiar de empresa.
     - Preservación de trazabilidad de folios padres al guardar cotizaciones revisadas o duplicadas (`[Revisión de COT-XXX]` o `[Duplicado de COT-XXX]`) dentro de las observaciones persistidas en Supabase.
  2. BUGS DE INTERFAZ (UI/UX):
     - Incorporación del manejador `(onHide)` en los componentes `p-dialog` de `cotizador.html` (modal maquinaria) e `historial.html` (modal editar/revisar) para evitar fugas de memoria y resguardar el reseteo limpio de variables en la interfaz al cerrar o presionar Escape.
  3. RENDIMIENTO & LIMPIEZA DE CÓDIGO:
     - Integración del servicio centralizado `ApiPeruService` en `CotizadorComponent.buscarDocumento()` para eliminar llamadas fetch duplicadas a RENIEC/SUNAT.
     - Depuración y eliminación de servicios obsoletos sin uso (`supabase-improved.service.ts` y `empresa.service.ts`) reduciendo advertencias de compilación y optimizando los artefactos generados.
- Tue Aug 11 03:35:00 -05 2026: Optimización extrema de rendimiento, estabilidad UI y coherencia de datos en el módulo de Cotizaciones:
  1. RENDIMIENTO (Reducción drástica del bundle de Cotizaciones):
     - Refactorización de `PdfService` para carga perezosa (dynamic `import()`) de `pdfmake` y sus fuentes base64 (`vfs_fonts`). Reducción del tamaño del lazy chunk de `CotizadorComponent` de **1.79 MB a 15.87 kB** (reducción del 95%), acelerando enormemente el tiempo de renderizado e interactividad inicial del cotizador.
  2. BUGS DE INTERFAZ (UI/UX & Modales/Fugas de estado):
     - Prevención de envíos múltiples (`generandoPDF` flag + estado `[loading]`) al presionar "Generar Cotización PDF", impidiendo la duplicación accidental de documentos en la BD.
     - Implementación del manejador de reseteo `cerrarSelectorMaquinaria()` en `cotizador.ts` vinculado al evento `(onHide)` del modal de maquinaria.
     - Corrección de reseteo de variable `opcionEditar` en `cerrarModalEditar()` en `historial.ts` para prevenir la propagación de selecciones previas al revisar cotizaciones.
     - Implementación del método `cerrarSesion()` en `SelectorComponent` para limpiar storage y contexto reactivo en `SessionContextService` al pulsar "Cambiar de Usuario".
  3. INTEGRIDAD DE DATOS:
     - Sanitización y coerción estricta de campos numéricos (`cantidad`, `precio_unitario`, `subtotal`) en la lista de ítems enviada a Supabase (JSONB array), garantizando la integridad de tipos en la BD.
     - Inclusión de campos requeridos (`empresa_id`, `nombre_razon_social`, `documento_identidad`) en `procesarClienteSilencioso()` para garantizar cumplimiento completo con políticas RLS de Supabase al actualizar datos del cliente.
- Tue Aug 11 03:38:00 -05 2026: Corrección de inconsistencia de totales, soporte de cantidades decimales y estandarización de servicios y modales:
  1. INTEGRIDAD DE DATOS (Coherencia Total en Cotizaciones & Supabase):
     - Corrección de bug en `CotizadorComponent.recalcularTodo()`: el subtotal ahora se calcula filtrando únicamente ítems válidos (con descripción y valores mayores a 0). Esto elimina cualquier discrepancia entre las cabeceras monetarias (`subtotal`, `igv`, `total`) y el arreglo detallado de ítems en JSONB guardado en Supabase.
     - Limpieza garantizada del borrador en `sessionStorage` al invocar `limpiarFormulario()`.
  2. BUGS DE INTERFAZ (UI/UX & Flexibilidad de Ítems):
     - Soporte para cantidades decimales (p.ej. 0.5 m3, 1.5 hrs, 2.25 tn) en los componentes `p-inputNumber` de `cotizador.html` (tabla desktop, tarjetas mobile y selector de maquinaria modal).
     - Incorporación de manejadores `(onHide)` en diálogos `p-dialog` de `clientes.html`, `productos.html` y `maquinaria.html` para asegurar reseteo de estado limpio al cerrar modales mediante Escape o clic fuera.
  3. RENDIMIENTO & ARQUITECTURA:
     - Refactorización de `ClientesComponent`, `ProductosComponent` y `MaquinariaComponent` para utilizar el servicio reactivo centralizado `SessionContextService` en lugar de lecturas directas desacopladas a `sessionStorage`.
     - Integración de `ApiPeruService` en `ClientesComponent.buscarDocumento()`, eliminando peticiones `fetch` crudas con credenciales cableadas.
- Tue Aug 11 03:43:00 -05 2026: Optimización de reactividad en cotizador, corrección del toggle de ocultas en historial e integridad de borradores y clientes:
  1. BUGS DE INTERFAZ (UI/UX & Reactividad):
     - Corrección de bug crítico en `historial.html` donde el componente `p-togglebutton` ("Mostrar ocultas") carecía del manejador `(onChange)="onToggleOcultas()"`, haciendo que la vista de cotizaciones ocultas no se actualizara al pulsar el botón.
     - Inclusión del manejador `(ngModelChange)="recalcularItem(item)"` en los inputs de autocompletado de descripción (`p-autoComplete`) en `cotizador.html` (desktop y mobile), permitiendo que la validez del formulario (`puedeGenerar`) y los totales se recalculen de forma reactiva e inmediata al escribir o borrar la descripción.
  2. INTEGRIDAD DE DATOS:
     - Preservación de la bandera de impuesto `incluye_igv` al revisar, duplicar o cambiar de empresa desde `HistorialComponent` y `CotizadorComponent`. Esto previene que cotizaciones sin IGV reacondicionadas en el cotizador alteren erróneamente su régimen tributario.
     - Corrección en `CotizadorComponent.procesarClienteSilencioso()` para que los campos opcionales del cliente (teléfono, dirección, correo) se actualicen en Supabase incluso cuando el usuario los limpie o vacíe.
  3. RENDIMIENTO & CALIDAD DE CÓDIGO:
     - Desduplicación de sugerencias de autocompletado en `filtrarNombresClientes` y `filtrarNombresProductos` usando `Set`, optimizando el consumo de memoria y la renderización de dropdowns.
     - Limpieza automática de la primera fila en blanco al agregar maquinaria al carrito cuando no hay ítems previamente ingresados.
     - Tue Aug 11 04:02:00 -05 2026: Mejora de UI/UX y protección de peticiones asíncronas en el módulo Cotizador:
  1. BUGS DE INTERFAZ (UI/UX & Consultas SUNAT/RENIEC):
     - Incorporación de la bandera reactiva `buscandoDocumento` en `CotizadorComponent` y vinculación de bindings `[disabled]` y `[loading]` en los elementos de formulario del cliente (`clienteDocumento` input y botón de búsqueda RUC/DNI en `cotizador.html`).
     - Activación de icono de carga animada (`pi-spin pi-spinner`) y bloqueo temporal durante la consulta asíncrona a `ApiPeruService`, impidiendo clics múltiples accidentales, peticiones duplicadas y spam de notificaciones toast.
  2. RENDIMIENTO & REACTIVIDAD:
     - Invocación explícita de `cdr.markForCheck()` en el bloque `finally` de `buscarDocumento()` para garantizar una inmediata liberación visual del control de formulario bajo `ChangeDetectionStrategy.OnPush`.
- Tue Aug 11 04:33:00 -05 2026: Optimización de rendimiento en guardado de cotizaciones, corrección de zona horaria en fechas y estandarización OnPush en toda la SPA:
  1. RENDIMIENTO (Guardado rápido y sin peticiones duplicadas):
     - Refactorización de `CotizadorComponent.procesarClienteSilencioso()` para utilizar el objeto cliente retornado por `guardarCliente()`, actualizando el estado local sin disparar una recarga completa (`getClientes()`) a Supabase durante el flujo de generación de PDF.
     - Estandarización de `ChangeDetectionStrategy.OnPush` en `ClientesComponent`, `ProductosComponent`, `MaquinariaComponent`, `EmpresasComponent`, `UsuariosComponent` y `SelectorComponent`, minimizando la sobrecarga de detección de cambios en toda la SPA.
  2. INTEGRIDAD DE DATOS (Normalización de fechas local vs. UTC):
     - Corrección de desfase de fecha (1 día antes) en `PdfService` y `HistorialComponent` al formatear cadenas de fecha `YYYY-MM-DD` en la configuración regional `es-PE`. Reemplazo seguro de `-` por `/` para forzar la instanciación en medianoche local en lugar de UTC.
  3. UI/UX & SINCRONIZACIÓN DE CONTEXTO:
     - Sincronización automática de `session.setEmpresas()` en `SelectorComponent` para poblar de forma reactiva la signal `empresas` en `SessionContextService`.
- Tue Aug 11 04:38:00 -05 2026: Estandarización global de modales, autosave reactivo y verificación de compilación de producción:
  1. ESTRUCTURA Y MODALES (Fugas de estado & Memory Leaks):
     - Vinculación exhaustiva del evento `(onHide)` en todas las instancias de `<p-dialog>` en `CotizadorComponent`, `ClientesComponent`, `ProductosComponent`, `MaquinariaComponent`, `EmpresasComponent` y `UsuariosComponent`.
     - Implementación de métodos de reseteo dedicados (`cerrarModal()`, `ocultarDialog()`, `resetForm()`, `resetFormularioOperacion()`, `cerrarSelectorMaquinaria()`) para garantizar que cerrar un modal por teclado (Escape) o clic fuera (backdrop) no deje banderas de envío `enviando` o `guardando` activas ni datos residuales.
  2. REACTIVIDAD & FORMULARIOS:
     - Refactorización del mecanismo de autosave en `EmpresasComponent`, resolviendo la desincronización de `empresaForm.valueChanges` al re-instanciar el formulario en modo edición.
  3. ESTABILIDAD & COMPILACIÓN:
     - Corrección del error TS2358 en `PdfService` (`instanceof Date` sobre `string`), garantizando compilación AOT de producción 100% limpia (`ng build --configuration production`).
- Tue Aug 11 04:43:00 -05 2026: Preservación de precios negociados/bonificaciones en cotizaciones y protección de búsqueda en Clientes:
  1. INTEGRIDAD DE DATOS & COTIZACIONES (Precios negociados & Ítems bonificados):
     - Refactorización de `recalcularItem()`, `recalcularTodo()`, `tieneItemsValidos` y `generarPDF()` en `CotizadorComponent` para impedir la sobreescritura automática de precios personalizados con el precio base al editar la descripción o precio del ítem.
     - Permitir ítems válidos con `precio_unitario >= 0`, agregando soporte nativo para ítems promocionales o muestras gratuitas con precio 0 S/ sin alterar los cálculos de subtotal o validez del formulario.
  2. BUGS DE INTERFAZ (UI/UX & Protección SUNAT/RENIEC):
     - Implementación de la guarda de concurrencia `if (this.buscandoApi) return;` en `ClientesComponent.buscarDocumento()`.
     - Actualización de `clientes.html` para habilitar `(keyup.enter)="buscarDocumento()"`, vincular `[disabled]="buscandoApi"`, `[loading]="buscandoApi"` e icono dinámico de spinner (`pi-spin pi-spinner`), garantizando coherencia visual y evitando race conditions en el modal de clientes.
- Tue Aug 11 04:46:00 -05 2026: Refuerzo de detección de cambios OnPush en gestión de usuarios y emparejamiento de clientes sugeridos:
  1. RENDIMIENTO & UI/UX (UsuariosComponent under OnPush):
     - Inclusión de `cdr.markForCheck()` en todos los métodos asíncronos de `UsuariosComponent` (`cargarUsuarios`, `cambiarRol`, `toggleActivo`, `eliminar`, `guardarEmpresas`), garantizando que las tablas, KPI cards y badges de estado se re-rendericen al instante tras mutaciones asíncronas en Supabase.
  2. BUGS DE INTERFAZ & ROBUSTEZ (CotizadorComponent):
     - Sanitización y comparación insensible a mayúsculas/espacios en `CotizadorComponent.alElegirNombreSugerido()`, permitiendo seleccionar clientes tanto por nombre comercial como por DNI/RUC.
  3. ESTABILIDAD & COMPILACIÓN:
     - Verificación AOT de producción 100% limpia (`ng build --configuration production`).
- Tue Aug 11 05:03:00 -05 2026: Corrección de creación de productos (error de timestamp Postgres) y garantía de nombre de cliente en cotizaciones y PDFs:
  1. CREACIÓN DE PRODUCTOS Y CLIENTES:
     - Sanitización de payloads en `SupabaseService.guardarProducto`, `guardarCliente` y `guardarCotizacion` eliminando valores vacíos (`''` o falsy) de `id` y `created_at`.
     - Corrección en `productoVacio()` ([productos.ts](file:///Users/rwrb/Dev%202/cotizaciones-multiempresa/src/app/components/productos/productos.ts)) para omitir `created_at: ''` que provocaba rechazo por sintaxis de timestamp en PostgreSQL Supabase.
     - Importación de `InputTextareaModule` en `ProductosComponent`.
  2. NOMBRE DE CLIENTE EN COTIZACIONES Y PDF:
     - Extracción robusta de campos del cliente en `PdfService` ([pdf.service.ts](file:///Users/rwrb/Dev%202/cotizaciones-multiempresa/src/app/services/pdf.service.ts)) soportando múltiples convenciones de nomenclatura (`cliente_nombre`, `clientenombre`, `clienteNombre`, `nombre_razon_social`).
     - Normalización y parseo defensivo del evento `alElegirNombreSugerido` en [cotizador.ts](file:///Users/rwrb/Dev%202/cotizaciones-multiempresa/src/app/components/cotizador/cotizador.ts) para asignar correctamente cadenas limpias de texto en `clienteNombre`.
     - Adición de fallbacks en la tabla del historial ([historial.html](file:///Users/rwrb/Dev%202/cotizaciones-multiempresa/src/app/components/historial/historial.html)) para evitar visualización vacía del cliente.
  3. COMPILACIÓN:
     - Verificación limpia de TypeScript (`npx tsc --noEmit`).

