# Cotizaciones multiempresa

Aplicación web para emitir cotizaciones en PDF desde varias empresas con un
mismo usuario. Cada empresa tiene su catálogo, cartera de clientes,
maquinaria, cuentas bancarias, logo, firma y numeración de folios propios.
Es el prototipo multiempresa de SIGO-WM.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Angular 17.3 (componentes standalone, signals, `OnPush`), PrimeNG 17 + PrimeFlex |
| PDF | pdfmake, cargado bajo demanda |
| Backend | Supabase: Postgres con RLS, Auth y Storage |
| Hosting | Vercel (sitio estático + función `api/consulta-documento.ts`) |
| Consulta DNI/RUC | Decolecta, solo desde la función de Vercel |
| Offline | Service worker de Angular (instalable como PWA) |
| Pruebas | Vitest (frontend) y scripts SQL que se deshacen solos (BD) |

## Estructura

```
api/                      Función de Vercel: consulta DNI/RUC con sesión y límite por usuario
src/app/
  components/             Pantallas (cotizador, historial, clientes, productos, maquinaria, empresas, usuarios…)
  guards/                 Acceso por sesión y rol; verifican que la cuenta siga activa
  layout/                 Marco de la app (vendedor) y del panel de administración
  models/                 Tipos y lógica pura (p. ej. cálculo de totales)
  services/               Supabase, sesión, PDF, imágenes, consulta DNI/RUC, PWA
supabase/
  migrations/             Cambios de esquema, en orden de aplicación
  rollbacks/              Cómo deshacer cada migración
  pruebas_*.sql           Pruebas contra la BD real; corren en una transacción con rollback
  diagnostico_*.sql       Consultas de solo lectura
```

## Desarrollo local

```bash
npm install
npm start          # http://localhost:4200
npx vitest run     # pruebas del frontend
npx ng build       # build de producción
```

`ng serve` no ejecuta la función de Vercel. Para probar la búsqueda de DNI/RUC
en local, apunta el proxy a un despliegue:

```bash
API_PROXY_TARGET=https://cotizaciones-multiempresa.vercel.app npm start
```

## Configuración

`src/environments/environment.ts` tiene la URL y la *anon key* de Supabase.
Son públicas por diseño: la seguridad está en las políticas RLS, no en ocultarlas.

Variables de entorno en Vercel (Production y Preview):

| Variable | Uso |
| --- | --- |
| `DECOLECTA_TOKEN` | Token de Decolecta (secreto; nunca en el frontend) |
| `SUPABASE_URL` | Para validar la sesión del usuario en la función |
| `SUPABASE_ANON_KEY` | Ídem |

Las variables solo se aplican en un despliegue nuevo.

## Modelo de acceso

Las reglas viven en Postgres (RLS); el frontend solo esconde lo que el usuario
no puede usar.

- **Superadmin** (`profiles.rol = 'admin'`): ve y gestiona todo, crea empresas y usuarios.
- **admin_empresa**: edita la ficha, las cuentas bancarias y los logos de *sus* empresas.
- **vendedor**: cotiza y gestiona clientes, productos y maquinaria de sus empresas.
- Las empresas de cada usuario están en `usuario_empresa`. Un usuario con
  `profiles.activo = false` no ve nada. La app lo saca al iniciar sesión, al
  abrir una pestaña nueva o al navegar, porque el perfil se vuelve a
  confirmar cada 5 minutos.
- El usuario anónimo no tiene acceso a ninguna tabla.

Funciones auxiliares de las políticas: `es_superadmin()`,
`tiene_acceso_empresa(empresa)` y `es_admin_de_empresa(empresa)`.

## Cotizaciones

- Se crean **solo** con `crear_cotizacion()`, en una transacción. Esa función
  asigna el folio (`PREFIJO-00000001`, correlativo por empresa), recalcula
  importes e IGV (18 %), guarda o actualiza el cliente y, si es una revisión,
  anula la original. Si algo falla no se guarda nada ni se consume folio.
- Desde la app solo se puede cambiar el `estado` y la marca `oculta` de una
  cotización emitida. Ítems, totales y folio no se editan y las cotizaciones
  no se borran (se ocultan); para corregir se crea una **revisión**.
- **Revisión**: la nueva cotización reemplaza a la original
  (`cotizacion_origen_id`, `folio_origen`), y la original pasa a ANULADA al
  guardarse la nueva. Una cotización solo puede tener una revisión, y una
  original reemplazada no se puede reactivar.
- **Duplicado**: copia los datos; la original no cambia.
- Las condiciones del PDF (validez, cuentas, contacto) se guardan con la
  cotización, así que el PDF del historial sale igual al original.
- El cotizador muestra los totales con el mismo cálculo que el servidor
  (`calcularTotales` en `models/cotizacion.model.ts`).

## Base de datos

Las migraciones se aplican en orden con la CLI de Supabase vinculada al proyecto:

```bash
supabase db query --linked -f supabase/migrations/<archivo>.sql
```

Antes de aplicar una migración, ensáyala junto con su prueba dentro de una
transacción que termine en `rollback` (así se probaron todas las de este repo).
Las pruebas se corren igual:

```bash
supabase db query --linked -f supabase/pruebas_cotizaciones.sql
```

Hay migraciones que dependen del frontend. `20261029030000_cotizaciones_solo_por_funcion.sql`,
por ejemplo, se aplica después de desplegar el frontend que usa
`crear_cotizacion()`, porque la versión anterior insertaba directamente.

**Pendiente:** el esquema base (anterior a estas migraciones) no está
versionado. Para generarlo hace falta Docker (`supabase db dump`).

## Despliegue

Cada push a `main` despliega en Vercel. Si un cambio necesita una migración,
el orden es: migración aditiva → push del frontend → migración que cierra
lo viejo.
