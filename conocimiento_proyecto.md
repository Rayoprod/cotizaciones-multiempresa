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
98: - **Refactorización Integral del Main Layout & Solución a Bugs PWA de Menú Sandwich y Scroll**:
   - **Menú Sandwich / Drawer PWA**: Eliminada la directiva `pTooltip` del botón toggle hamburguesa que interceptaba los eventos `touchstart`/`touchend` en navegadores móviles y PWAs standalone. Asignados z-indexes elevados (`z-layout-backdrop: 998`, `z-layout-sidebar: 999`) para prevenir que el menú quede atrapado debajo de modales u overlays de PrimeNG. Añadidas las clases CSS `closed` con `pointer-events: none` y `visibility: hidden` cuando el drawer está cerrado para evitar intercepciones de gestos laterales. Removidos los cierres tempranos de click en los tags `<a>` del sidebar delegando el cierre fluido a la suscripción de `NavigationEnd`. Incorporados listener de tecla Escape y clase de bloqueo `body.layout-menu-open` para eliminar el desplazamiento fantasma de fondo.
   - **Comportamiento del Scroll & Viewport Dynamic Height (`100dvh`)**: Actualizados los contenedores raíz del layout de `h-screen` (`100vh`) a `100dvh` (`h-svh h-dvh`), eliminando el desbordamiento vertical y los bloqueos de scroll causados por la barra de navegación del navegador en dispositivos móviles. Integrada la clase de scroll `.app-scroll-container` con `-webkit-overflow-scrolling: touch`, `overscroll-behavior-y: contain` y `touch-action: pan-y` para un desplazamiento inercial nativo e impecable en iOS y Android.
