# Cotizaciones multiempresa

Aplicación web para emitir cotizaciones en PDF desde varias empresas con un
mismo usuario. Cada empresa tiene su catálogo, cartera de clientes,
cuentas bancarias, logo, firma, lugares de entrega y numeración de folios
propios.
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
scripts/generar-tema.mjs  Genera src/theme/lara-acento.css; volver a correrlo al actualizar PrimeNG
src/app/
  components/             Pantallas (cotizador, historial, clientes, productos, empresas, usuarios…)
  guards/                 Acceso por sesión y rol; verifican que la cuenta siga activa
  layout/                 Marco de la app: un solo menú lateral para todos los roles
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

Cada persona tiene **una cuenta**. Esa cuenta se asigna a una o varias
empresas, y en **cada una** tiene un rol (`usuario_empresa.rol`): alguien
puede ser admin en VDC y vendedor en WM.

| Acción | Superadmin | Admin de la empresa | Vendedor de la empresa |
| --- | --- | --- | --- |
| Cotizar, revisar, cambiar estado, ocultar | ✓ | ✓ | ✓ |
| Clientes y productos (incluidos precios base) | ✓ | ✓ | ✓ |
| Ficha, cuentas bancarias, logos, lugares de entrega y modo de IGV | ✓ | ✓ | ✗ |
| Crear empresas y cuentas, asignar empresas y roles | ✓ | ✗ | ✗ |

- `profiles.rol` solo distingue al superadmin (`'admin'`) del resto (`'usuario'`).
- Un usuario con
  `profiles.activo = false` no ve nada. La app lo saca al iniciar sesión, al
  abrir una pestaña nueva o al navegar, porque el perfil se vuelve a
  confirmar cada 5 minutos.
- El usuario anónimo no tiene acceso a ninguna tabla.

Funciones auxiliares de las políticas: `es_superadmin()`,
`tiene_acceso_empresa(empresa)` y `es_admin_de_empresa(empresa)`.

## Cotizaciones

- Se crean **solo** con `crear_cotizacion()`, en una transacción. Esa función
  asigna el folio (`PREFIJO-00000001`, correlativo por empresa), recalcula
  importes, descuento e IGV, guarda o actualiza el cliente y, si es una
  revisión, anula la original. Si algo falla no se guarda nada ni se consume
  folio.
- Desde la app solo se puede cambiar el `estado` y la marca `oculta` de una
  cotización emitida. Ítems, totales y folio no se editan y las cotizaciones
  no se borran (se ocultan); para corregir se crea una **revisión**.
- **Revisión**: solo de una cotización Pendiente y dentro de la misma empresa.
  La nueva reemplaza a la original (`cotizacion_origen_id`, `folio_origen`), que
  pasa a Anulada al guardarse la nueva. La nueva lleva folio y fecha de hoy, nace
  Pendiente, su vendedor es quien la guarda y el PDF dice a cuál reemplaza. Cada
  cotización admite una sola revisión. Si cambia el RUC o DNI, el cotizador avisa.
- **Duplicado**: copia los datos dentro de la misma empresa, desde cualquier
  estado; la original no cambia.
- **Estados**: Pendiente pasa a Aprobada o Anulada; Aprobada vuelve a Pendiente o
  pasa a Anulada; Anulada es definitivo (el PDF sale con marca de agua). Lo aplica
  un trigger, que además guarda quién hizo el último cambio y cuándo.
- **Vencida** no es un estado: es una Pendiente con la validez pasada, y se calcula
  al mostrarla (`estaVencida`). No suma en "Por cobrar" y se puede aprobar o
  revisar. Las cotizaciones que no guardaron sus condiciones asumen 15 días.
- **IGV**, en tres modos (`incluye_igv` y `precios_con_igv`). Cada empresa define
  con cuál abre el cotizador (`empresas.modo_igv`), y se puede cambiar en cada
  cotización. El precio del catálogo se copia tal cual, sin convertir:

  | Modo | Total | `igv` | Aviso en el PDF |
  | --- | --- | --- | --- |
  | Sumar IGV | neto + 18 % | 18 % del neto | El total incluye IGV (18%) |
  | Ya incluyen IGV | neto | lo que el neto lleva dentro | Los precios incluyen IGV (18%) |
  | Sin IGV | neto | 0 | Los precios NO incluyen IGV |

  `subtotal` es siempre la suma de los ítems y neto = subtotal - `descuento_global`.
- El **vendedor** que imprime el PDF es `vendedor_nombre`: el nombre de la cuenta
  (Usuarios) copiado al crear la cotización. Sin nombre no se imprime esa línea;
  el correo (`vendedor`) nunca sale en el PDF.
- Las condiciones del PDF (validez, cuentas, contacto) se guardan con la
  cotización, así que el PDF del historial sale igual al original.
- El lugar de entrega se elige entre las opciones de la empresa
  (`empresas.lugares_entrega`), y el servidor rechaza cualquier otro. Se
  guarda el texto tal como sale en el PDF. Si la empresa no tiene opciones, el
  campo no aparece.
- El cotizador muestra los totales con el mismo cálculo que el servidor
  (`calcularTotales` en `models/cotizacion.model.ts`).

## Color de la empresa

Toda la interfaz usa un solo acento, el color de la empresa activa. `services/tema.ts`
lo convierte en las variables `--acento*` y lo oscurece si hace falta para que el texto
blanco se lea (contraste de al menos 4.5:1). El PDF y la cabecera usan el color original.
El tema de PrimeNG trae su azul escrito a mano, por eso la app usa una copia generada
con esas variables (`src/theme/lara-acento.css`) en lugar del tema original.

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
