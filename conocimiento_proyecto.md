# Conocimiento del Proyecto: Sistema de Cotizaciones Multiempresa

## 1. Visión General del Sistema
- **Tipo de Aplicación**: SPA (Single Page Application) para la gestión multiempresa de cotizaciones, clientes, productos, maquinaria e historial.
- **Framework & Arquitectura**: Angular 17.3+ utilizando **Standalone Components** (`standalone: true`, sin NgModules).
- **Lógica de Estado Central**: Driven by `SessionContextService` utilizando Angular Signals (`signal`, `computed`) respaldado por `sessionStorage` para persisitiendo contexto (`empresaActiva`, `usuario`, `empresas`, `rol`).
- **Base de Datos & Auth**: Supabase (`@supabase/supabase-js`) con PostgreSQL, Row Level Security (RLS) y RPCs personalizadas (ej. `getnextfolioempresa`).
- **Generación de Reportes**: `pdfmake` optimizado mediante **Lazy Dynamic Import** (`import('pdfmake/build/pdfmake')`) en `PdfService`.
- **PWA & Offline Capability**: `@angular/service-worker` integrado con `manifest.webmanifest`, assets cacheados (`ngsw-config.json`), `NetworkStatusService` con detección de conectividad en tiempo real y `OfflineSyncService` para almacenamiento local reactivo de entidades (productos, clientes, empresas) y cola persistente de cotizaciones offline con sincronización automática al recuperar la señal de red.
- **Tema Dinámico Multiempresa**: Inyección reactiva de la variable CSS `--company-accent-color` a nivel de `:root` sincronizada con la empresa activa mediante `SessionContextService.aplicarTemaEmpresa()`.

---

## 2. Dominio y Entidades Principales

### A. Empresa (`IEmpresa`)
- Contiene los datos fiscales y visuales de la empresa (`nombre_comercial`, `razon_social`, `ruc`, `color`, `direccion`, `telefonos`, `correo`, `ruta_logo`, `prefijo`, `mostrar_cuentas`).
- Posee una relación 1:N con `cuentas_bancarias` enriquecida en runtime mediante `SupabaseService.enriquecerConCuentasBancarias()`.

### B. Usuario & Roles (`IProfile`, `IUsuarioEmpresa`)
- Roles: `vendedor`, `admin`, `admin_empresa`, `admin_general`.
- Guards de acceso: `authGuard`, `adminGuard`, `adminGeneralGuard`, `initialRedirectGuard`.
- Relación N:M usuario-empresa manejada en la tabla `usuario_empresa`.

### C. Cliente (`ICliente`)
- Identificado por DNI (8 dígitos) o RUC (11 dígitos).
- Pertenencia aislada por `empresa_id`.
- Integración asíncrona con SUNAT/RENIEC mediante `ApiPeruService`.
- Sincronización silenciosa en cotizaciones via `CotizadorComponent.procesarClienteSilencioso()`.

### D. Producto (`IProducto`)
- SKU (`codigo_sku`), descripción, unidad, precio base (`precio_unitario_base`).
- Pertenencia estricta a `empresa_id`.

### E. Maquinaria (`IMaquinaria`, `ILecturaHorometro`)
- Equipos pesados con seguimiento de horómetro, mantenimiento por intervalo de horas, costo por hora/día/mes/venta.
- Integrados al carrito de cotizaciones mediante modal dedicado.

### F. Cotización (`ICotizacion`)
- Documento de venta con estado (`PENDIENTE`, `APROBADA`, `ANULADA`), `folio` secuencial por empresa, fecha, cliente, items en formato JSONB, subtotal, IGV (18%), total y observaciones.
- Soporta flujos de **Duplicado** y **Revisión** (anula original y crea referencia `[Revisión de COT-XXX]`).

---

## 3. Patrones de Código e Invariantes del Proyecto

1. **Gestión de Contexto Reactivo**:
   - Todo componente debe sincronizarse con `SessionContextService` en lugar de leer claves crudas de `sessionStorage`.
2. **ChangeDetectionStrategy.OnPush**:
   - `CotizadorComponent` utiliza `OnPush`. Toda modificación de datos asíncrona o calculada requiere invocación explícita de `cdr.markForCheck()`.
3. **Optimización de Bundle & Carga Lazy**:
   - `pdfmake` y `vfs_fonts` se importan dinámicamente en `PdfService` para no penalizar el tiempo de carga del chunk principal (mantiene el Lazy Chunk de cotizador en ~15 KB).
4. **Reseteo Limpio de Diálogos & Modales**:
   - Todos los componentes con `p-dialog` deben implementar `(onHide)` para resetear su estado y prevenir memory leaks o datos residuales.
5. **Carga Eficiente Multiempresa**:
   - Para obtener la lista de empresas del usuario con sus cuentas bancarias completas, usar `SupabaseService.getEmpresasDelUsuario()`.
6. **Protección de Consultas Asíncronas en OnPush**:
   - Todas las llamadas asíncronas externas a APIs (ej. SUNAT/RENIEC) deben gestionar una bandera de estado (ej. `buscandoDocumento`), vinculando `[disabled]` y `[loading]` en la plantilla e invocando `cdr.markForCheck()` en `try/finally` para evitar ejecuciones concurrentes o desincronización visual.
7. **Operación Directa Online en Tiempo Real**:
   - Todo registro de cotización, consulta de catálogo (productos/clientes/empresas) y generación de PDF opera de forma directa y transparente en tiempo real contra la base de datos de Supabase.

---

## 4. Historial de Bugs Reparados y Lecciones Aprendidas

- **Pérdida accidental de borradores**: Resuelto preservando `sessionStorage` ('cotizador-borrador') durante el cambio de empresa y validando la asignación previa de `empresaActiva`.
- **Botón PDF oculto por ngIf mal ubicado**: Corregido independizando la visibilidad del footer/resumen del estado de carga del cliente.
- **Totales discrepantes en JSONB Supabase**: Estandarizado `recalcularTodo()` para filtrar exclusivamente ítems válidos (descripción y valores > 0) antes de calcular subtotal, IGV y total.
- **Modales sin limpieza de estado**: Incorporado evento `(onHide)` en todos los diálogos `p-dialog` del sistema.
- **Duplicación multiempresa incompleta**: Corregido `HistorialComponent.cargarEmpresasDisponibles()` reemplazando select parcial con `getEmpresasDelUsuario()`, garantizando que la empresa de destino llegue con `cuentas_bancarias`, `color`, `direccion`, `prefijo` y datos fiscales completos.
- **Autocompletado manual en cotizador**: Implementado soporte en `recalcularItem()` para autocompletar SKU, unidad y precio base al escribir/pegar descripciones que coincidan con la base de datos de productos sin requerir clic obligatorio en el dropdown.
- **Búsqueda SUNAT/RENIEC sin spinner ni bloqueo visual**: Incorporada bandera reactiva `buscandoDocumento` en `CotizadorComponent.buscarDocumento()`, deshabilitando el input/botón y mostrando icono de carga (`pi-spin pi-spinner`) durante la consulta externa para prevenir peticiones duplicadas y spam de toasts.
- **Cotizaciones duplicadas tras guardar PDF**: Resuelto creando `resetearTrasGuardar()` en `CotizadorComponent`, el cual remueve el borrador en `sessionStorage` y reinicia los campos del formulario tras un guardado exitoso, evitando registros duplicados en Supabase por clics adicionales.
- **Fallback de folios con UUIDs de empresa**: Corregido `SupabaseService.obtenerSiguienteFolio()` agregando el parámetro `prefijoFallback`. En caso de fallo de la RPC, el sistema utiliza el prefijo comercial real de la empresa (`empresa.prefijo`) en vez de truncar un UUID.
- **Coerción falsy de 0 en borradores**: Corregido en `cargarBorradorSiExiste()` de `|| null` a `?? null`, asegurando que ítems con cantidad o precio `0` mantengan su valor numérico al restaurarse.
- **Aislamiento de la persistencia BD y la generación de PDF**: Resuelto en `CotizadorComponent.generarPDF()` separando la transacción de inserción en Supabase del proceso de exportación del PDF. Si la generación del PDF falla por problemas del navegador o red, se notifica que la cotización fue guardada correctamente en la BD con su folio y se ejecuta `resetearTrasGuardar()`, evitando que reintentos del usuario creen registros duplicados con folios consecutivos.
- **Asignación robusta de productos sugeridos en OnPush**: Sanitizada la coincidencia en `alElegirProductoSugerido()` con `.toLowerCase().trim()`, garantizando la correcta vinculación de SKU, precio base y unidad en el autocompletado de ítems sin importar variaciones menores de espacios o mayúsculas.
- **Eliminación de memory leaks por suscripciones RxJS a router.events**: Incorporado `takeUntilDestroyed` (`@angular/core/rxjs-interop`) en `LayoutComponent` y `AdminLayoutComponent`, garantizando la cancelación automática de la suscripción a eventos de navegación al destruir o reconstruir componentes.
- **Vinculación estricta de cliente_id y fallback vendedor**: Actualizado `CotizadorComponent.generarPDF()` para enlazar la clave foránea `cliente_id` tras `procesarClienteSilencioso()` e incorporar `obtenerUsuarioActual()` como respaldo de email en el campo `vendedor`.
- **Eliminación de consultas SELECT redundantes al guardar cliente silencioso**: Optimizado `CotizadorComponent.procesarClienteSilencioso()` para utilizar la entidad retornada por `guardarCliente()` al insertar o actualizar un cliente, eliminando la recarga completa (`getClientes()`) desde Supabase durante el guardado de cotizaciones y acelerando la generación de PDF.
- **Normalización de parseo de fechas en zona horaria local**: Solucionado desfase de 1 día en reportes PDF e Historial en formato `es-PE` al formatear fechas almacenadas en formato date-only (`YYYY-MM-DD`), normalizando las cadenas mediante reemplazo seguro de guiones por barras (`replace(/-/g, '/')`) para forzar la interpretación en medianoche local.
- **Sincronización de lista de empresas en SessionContextService**: Actualizado `SelectorComponent` para invocar `session.setEmpresas()` al cargar las empresas asignadas al usuario, asegurando que la signal `empresas` refleje el listado disponible en todo el ciclo de vida de la aplicación.
- **Estandarización masiva de OnPush**: Aplicado `ChangeDetectionStrategy.OnPush` en todos los componentes de gestión (`ClientesComponent`, `ProductosComponent`, `MaquinariaComponent`, `EmpresasComponent`, `UsuariosComponent`, `SelectorComponent`), garantizando una estrategia de renderizado optimizada en toda la SPA.
- **Estandarización estricta de (onHide) en modales p-dialog**: Garantizada la vinculación del evento `(onHide)` en todos los modales del sistema (`CotizadorComponent`, `ClientesComponent`, `ProductosComponent`, `MaquinariaComponent`, `EmpresasComponent`, `UsuariosComponent`, `HistorialComponent`), asegurando la limpieza de estado, reseteo de banderas `enviando`/`guardando` y prevención de memory leaks tras cierres por Escape o backdrop.
- **Refactorización de Autosave en EmpresasComponent**: Resuelto problema de suscripción huérfana en `empresaForm.valueChanges` al editar empresas re-vinculando dinámicamente `autoSaveSub` al instanciar o cambiar el formulario reactivo.
- **Corrección de tipado TS2358 en PdfService**: Corregido chequeo de tipo en `fechaRaw` para la generación de reportes PDF, asegurando compilación de producción exitosa en Angular 17.3+.
- **Preservación de precios personalizados y bonificaciones (precio 0)**: Refactorizados `recalcularItem()`, `recalcularTodo()`, `tieneItemsValidos` y `generarPDF()` en `CotizadorComponent` para evitar sobreescribir precios negociados o vaciar el precio a valor base durante la edición, y permitir ítems válidos con `precio_unitario >= 0` (bonificaciones/muestras gratuitas).
- **Protección de peticiones asíncronas y UX en ClientesComponent**: Incorporada la guarda de concurrencia `if (this.buscandoApi) return;` en `ClientesComponent.buscarDocumento()`, junto con bloqueo `[disabled]`, `(keyup.enter)` e icono dinámico de spinner (`pi-spin pi-spinner`) en la plantilla HTML para evitar race conditions y peticiones duplicadas a SUNAT/RENIEC.
- **Refuerzo de ChangeDetectionStrategy.OnPush en UsuariosComponent**: Agregada la llamada explícita `this.cdr.markForCheck()` en `cargarUsuarios()`, `cambiarRol()`, `toggleActivo()`, `eliminar()` y `guardarEmpresas()` para asegurar la actualización inmediata de la UI tras operaciones asíncronas bajo OnPush.
- **Búsqueda robusta por coincidencia de cliente sugerido en Cotizador**: Actualizada `alElegirNombreSugerido()` en `CotizadorComponent` para comparar el término ingresado contra `nombre_razon_social` y `documento_identidad` de forma normalizada con `.toLowerCase().trim()`, previniendo errores por diferencias de espacios o capitalización.
- **Liberación garantizada de estado visual en componentes OnPush**: Incorporada la invocación explícita de `cdr.markForCheck()` en los bloques `finally` de `guardarCliente()` en `ClientesComponent`, `guardarProducto()` en `ProductosComponent`, y `guardar()` / `guardarOperacion()` in `MaquinariaComponent`. Esto previene que botones de acción queden congelados en estado `enviando`/`guardando` si ocurre una excepción asíncrona en Supabase bajo la estrategia `ChangeDetectionStrategy.OnPush`.
- **Detección inteligente de versiones Service Worker y Prompt de Instalación PWA**: Creado `PwaUpdateService` para capturar eventos `SwUpdate.versionUpdates` notificando al usuario mediante Toast interactivo para recargar a la nueva versión sin romper sesiones activas, y capturar `beforeinstallprompt` habilitando el botón "Instalar App" en el header superior PWA en dispositivos móviles y de escritorio. Eliminadas las advertencias CommonJS de compilación mediante `allowedCommonJsDependencies` en `angular.json`.
- **Suministro Global Root de MessageService y ConfirmationService**: Registrados `MessageService` y `ConfirmationService` en `appConfig.providers` (`app.config.ts`) y configurada la inyección opcional `@Optional()` en `PwaUpdateService`. Esto previene errores de inyección del inyector raíz (`NullInjectorError: No provider for MessageService!`), garantizando que la aplicación se monte correctamente sin pantallas en blanco ni fallos de arranque en ningún módulo.
- **Creación Directa e Integral de Usuarios**: Implementado modal de creación de usuario en `UsuariosComponent` permitiendo registrar nuevas cuentas con email, contraseña temporal y rol asignado (`admin`, `admin_empresa`, `vendedor`) mediante API de autenticación e inyección en `SessionContextService`.
- **Estandarización Total OnPush y Animaciones UX/UI PWA**: Aplicado `ChangeDetectionStrategy.OnPush` en el 100% de los componentes de la SPA (incluyendo `LayoutComponent`, `AdminLayoutComponent` y `LoginComponent`). Integrada la micro-animación CSS `@keyframes modalScaleUp` en `styles.scss` con desenfoque de fondo en modales (`backdrop-filter: blur(8px)`), garantizando fluidez táctil y respuesta visual instantánea en dispositivos móviles PWA.
- **Sistema Autónomo de Detección de Nuevas Versiones y Auto-Actualización PWA**: Configurado `PwaUpdateService` con `registerImmediately` en `app.config.ts`, chequeo periódico cada 5 minutos, detección en `visibilitychange` al retornar el foco de ventana y manejo del evento `unrecoverable` para evitar estados obsoletos de caché. Integrado botón relámpago `Actualizar App` y Toast interactivo persistente `<p-toast key="pwa-update-toast">`.
- **Refactorización Integral del Main Layout & Solución a Bugs PWA de Menú Sandwich y Scroll**:
   - **Menú Sandwich / Drawer PWA**: Eliminadas restricciones de `touch-action: none` en `body.layout-menu-open` reemplazándolas por `touch-action: pan-y` para permitir desplazamiento inercial y toques táctiles impecables dentro del menú drawer desplegable. Vinculado `(click)="cerrarMenu()"` directamente en cada enlace de navegación (`<a>`) de `LayoutComponent` y `AdminLayoutComponent` para garantizar el cierre inmediato al pulsar cualquier ítem (incluyendo la ruta activa actual). Asignados z-indexes jerárquicos (`z-layout-backdrop: 1040`, `z-layout-sidebar: 1050`, `top-header: 100`) para evitar solapamientos con overlays y modales. Aplicada aceleración por GPU con `transform: translate3d(-100%, 0, 0)` y `-webkit-tap-highlight-color: transparent`.
   - **Comportamiento del Scroll & Reseteo al Navegar**: Actualizados los contenedores raíz del layout a `h-full min-h-full` respaldados por `100dvh` y `min-height: -webkit-fill-available` en `html` y `body`. Integrada la función `resetearScrollContenedor()` suscrita a `NavigationEnd` para restablecer automáticamente el scroll superior (`scrollTop = 0`) al cambiar entre rutas en `.layout-router-outlet`, eliminando desbordamientos de pantalla y saltos bruscos en móviles PWA.
- **Eliminación de Consultas N+1 en Carga de Empresas y Cuentas Bancarias**: Refactorizados `SupabaseService.getEmpresasDelUsuario()` y `EmpresasComponent.cargarEmpresas()` para reemplazar bucles de consultas individuales a `cuentas_bancarias` por consultas de lote masivo (`.in('empresa_id', ids)`). Esto redujo N peticiones consecutivas a Supabase a 1 sola consulta agrupada por diccionario en memoria, acelerando drásticamente el tiempo de carga del selector de empresas y del panel administrativo.
- **Corrección de Flujo Asíncrono en PwaUpdateService**: Agregado el operador `first()` al Observable `appRef.isStable` en `PwaUpdateService.initPeriodicCheck()`. Esto asegura que el stream complete tras estabilizarse la aplicación, permitiendo que `concat()` inicie correctamente el intervalo de comprobación periódica de actualizaciones PWA cada 5 minutos.
- **Centralización Singleton de MessageService y ConfirmationService**: Eliminadas las declaraciones locales redundantes en el array `providers` de todos los componentes y layouts de la aplicación (`LayoutComponent`, `ClientesComponent`, `CotizadorComponent`, `EmpresasComponent`, `HistorialComponent`, `MaquinariaComponent`, `ProductosComponent`, `UsuariosComponent`). Esto consolida el uso de las instancias raíz de `MessageService` y `ConfirmationService` provistas en `app.config.ts`, evitando notificaciones huérfanas, duplicidad de memoria y garantizando la entrega unificada de toasts PWA en cualquier nivel de la interfaz.
- **Inclusión de Toast Notifications en AdminLayoutComponent**: Agregados los componentes `<p-toast>` y `<p-toast key="pwa-update-toast">` en `admin-layout.html` e importado `ToastModule` en `AdminLayoutComponent`, asegurando la visibilidad de notificaciones PWA y avisos del sistema en la vista administrativa.
- **Cobertura 100% OnPush y Optimización de Consultas de Perfil Supabase**: Incorporado `ChangeDetectionStrategy.OnPush` en el componente raíz `App` (`app.ts`), alcanzando el 100% de cobertura OnPush en todos los componentes de la aplicación. Optimizado `obtenerPerfil(userId?: string)` en `SupabaseService` para recibir el ID del usuario en `LoginComponent`, `LayoutComponent` y `AdminLayoutComponent`, eliminando peticiones HTTP redundantes a `auth.getUser()`. Estandarizados blancos táctiles globales (`min-height: 44px` en botones/inputs y `48px` en links) en `styles.scss` para PWA.
- **Solución Definitiva y Redireccionamiento al Bloqueo del Menú Sanguchito en Pantallas <= 640px**:
   - **Diagnóstico del Bug**: Al reducir la pantalla a `<= 640px`, la regla `@media screen and (max-width: 640px)` en `styles.scss` reposicionaba el contenedor `<p-toast>` a `top: 0.75rem` con `width: calc(100vw - 1.25rem)` y `z-index: 1100`. Debido a que PrimeNG mantiene los wrappers `<p-toast>` en el DOM (incluso estando vacíos), este contenedor invisible con z-index 1100 se superponía sobre el margen superior de la barra de navegación (`z-index: 100`), bloqueando los eventos táctiles y clics dirigidos al botón del sanguchito.
   - **Solución Aplicada**:
     1) Se ajustó la posición de `.p-toast:not(.p-toast-bottom-center)` en móviles a `top: calc(4.25rem + env(safe-area-inset-top, 0px)) !important;`, situando cualquier notificación activa **debajo** de la barra de navegación ejecutiva (~3.75rem + safe area top) y dejando el encabezado 100% despejado en todo momento.
     2) Se agregó la regla `.p-toast:not(:has(.p-toast-message)) { display: none !important; }` en `styles.scss` para ocultar totalmente el contenedor de toast cuando no contiene notificaciones activas.
     3) Se inyectó `@ViewChild('opCompany') opCompany?: OverlayPanel` en `LayoutComponent` y se actualizó `toggleMenu(event?: Event)` y `toggleSidebar(event?: Event)` para invocar `event?.stopPropagation()` y ocultar automáticamente el panel desplegable de empresas al alternar el menú lateral.
     4) Se asignó `[style]="{ width: '92vw', maxWidth: '340px' }"` en `p-overlayPanel` para asegurar una adaptabilidad responsiva impecable en teléfonos móviles pequeños (320px..640px).
- **Auto-Actualización Silenciosa PWA y Eliminación de Elementos Recargados de Encabezado**:
   - **Cero Botones Manuales y Cero Interrupción UI**: Removidos por completo el botón "Actualizar App", el diálogo/toast de notificación de versión `pwa-update-toast` y la etiqueta "Online / Offline" del encabezado en `LayoutComponent` y `AdminLayoutComponent`.
   - **Mecanismo Autónomo Transparente**: Actualizado `PwaUpdateService.initUpdateListener()` para que al capturar la emisión de `VERSION_READY` del Service Worker, active automáticamente los nuevos artefactos (`activateUpdate()`) y recargue silenciosamente la ventana en segundo plano (`window.location.reload()`), entregando siempre la última versión compilada sin intervención del usuario.
- **Eliminación Total de Contenedores p-toast Duplicados y Solución Definitiva de Tactilidad en Menú Sanguchito (<= 640px)**:
    - **Diagnóstico**: Se identificaron instancias duplicadas de `<p-toast>` declaradas en las plantillas de componentes hijos (`clientes.html`, `cotizador.html`, `empresas.html`, `historial.html`, `maquinaria.html`, `productos.html`, `usuarios.html`) además de los Layouts raíz. Al ser instanciadas por PrimeNG, múltiples contenedores fijos con `z-index: 1100` capturaban eventos de toque sobre la barra de navegación superior (`z-index: 100`), bloqueando la respuesta táctil del menú sanguchito en pantallas móviles `<= 640px` y produciendo notificaciones emergentes repetidas.
    - **Solución Aplicada**:
      1) Se removieron todas las etiquetas `<p-toast>` secundarias en componentes de vistas hijas, unificando la renderización de toasts exclusivamente en los Layouts principales a través de los servicios globales `MessageService` y `ConfirmationService` registrados en `app.config.ts`.
      2) Se inyectó `event.preventDefault()` y `touch-action: manipulation; -webkit-tap-highlight-color: transparent;` en el botón circular del sanguchito (`toggleMenu` y `toggleSidebar`) evitando eventos fantasma de doble toque en pantallas táctiles móviles.
      3) Se actualizaron las reglas en `styles.scss` para asignar `pointer-events: none !important` y `.p-toast:empty { display: none !important; pointer-events: none !important; visibility: hidden !important; }`, garantizando que contenedores inactivos o vacíos de toast jamás intercepten toques en ninguna resolución.
      4) Se refinó la adaptabilidad del encabezado en `layout.component.html` reduciendo el ancho del selector de empresa con `max-width: clamp(120px, 40vw, 280px)` y `min-width: 0`, y colapsando el texto del botón PWA en móviles (`hidden sm:inline`), asegurando un layout 100% fluido desde 320px hasta pantallas ultra-wide.
    - **Solución Definitiva de Tactilidad y Stacking Context para Menú Sanguchito en Pantallas <= 640px**:
    - **Diagnóstico del Bug Residual**: A pantallas `<= 640px`, la regla CSS media query aplicaba un ancho extendido `width: calc(100vw - 1.25rem)` y `left: 0.625rem` sobre el contenedor de notificaciones de PrimeNG. Debido a que el selector CSS usado anteriormente era la clase `.p-toast`, la etiqueta personalizada del Angular Host Element `<p-toast>` no era capturada por `.p-toast`, manteniendo `pointer-events: auto` y un `z-index: 1100` que sobrepasaba al encabezado (`z-index: 100`). Adicionalmente, en pantallas táctiles móviles, los eventos de doble disparo `touchstart` y `click` alternaban el estado `menuAbierto` de `true` a `false` de forma instantánea (200ms), provocando una sensación de bloqueo en el botón.
    - **Solución Definitiva Aplicada**:
      1) Elevado el `z-index` de `.pwa-top-header` a `1000 !important` y `position: relative !important` en `styles.scss`, con `relative z-3` en el botón del sanguchito para garantizar prioridad total sobre la capa de contenidos.
      2) Añadido el selector de etiqueta `p-toast` a las reglas de `pointer-events: none !important` y colapso de vacíos (`p-toast:empty`, `p-toast:not(:has(.p-toast-message)) { display: none !important; height: 0 !important; width: 0 !important; }`), impidiendo que el host element de PrimeNG intercepte eventos de toque sobre la barra superior.
      3) Implementado un guardián de debounce temporal (250ms) `lastToggleTime` con escuchadores explícitos `(touchstart)` y `(click)` en `toggleMenu()` (`LayoutComponent`) y `toggleSidebar()` (`AdminLayoutComponent`), anulando disparos dobles por toques de pantalla en dispositivos móviles.
      4) Verificación exitosa en compilación AOT de producción `npm run build` (0 errores).
- **Corrección de Translucidez y Restauración del Fondo Global (`surface-ground-bg`)**:
    - **Diagnóstico del Artefacto Visual**: Al forzar `background-color: #0f172a !important` en `body` y `html`, combinados con `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, la vista raíz del lienzo web se tornó completamente oscura. Los diálogos, modales, componentes con bordes redondeados y vistas previas del PDF en iOS Safari/PWA proyectaron bordes oscuros gigantes que deformaron la pantalla del dispositivo.
    - **Solución Definitiva Aplicada**:
      1) Restaurado `background-color: var(--surface-ground-bg);` (`#f8fafc`) en `html` y `body` en `styles.scss`, restituyendo el lienzo claro de la aplicación para modales, tablas y vistas previas.
      2) Ajustado en `index.html` la meta etiqueta a `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, permitiendo que el sistema operativo de iOS respete el color estático `<meta name="theme-color" content="#0f172a">` sin distorsiones del viewport.
      3) Refinado el selector `.pwa-company-pill` en `layout.component.html` con `max-width: clamp(140px, 55vw, 320px)` y `flex-shrink-1` para mantener proporciones perfectas en cualquier pantalla móvil.
