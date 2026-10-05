# Plan PWA v2 - Rhinos App (Core Vendedor)

> **Proposito:** ofrecer una experiencia movil instalable y resistente a conectividad intermitente para vendedores en campo, sin comprometer aislamiento de datos, consistencia comercial ni seguridad.
>
> **Estado:** plan canonico actualizado contra la implementacion. Fases 0 a 3 implementadas tecnicamente; quedan integracion con base real, aceptacion Android y validacion mobile del flujo completo.
>
> **Decision arquitectonica:** comenzar con una PWA enfocada en vendedores. Expo/React Native queda como alternativa futura si el piloto demuestra limitaciones operativas concretas. El snapshot, los contratos y la API de comandos se disenaran independientes del cliente para que puedan reutilizarse en una app nativa.

---

## 1. Resumen ejecutivo

La PWA se divide en tres responsabilidades independientes:

1. **Shell PWA:** instalacion, carga de assets, fallback offline y actualizaciones con Serwist.
2. **Datos offline:** snapshot explicito y minimo de los datos permitidos para el vendedor, persistido en IndexedDB por usuario y organizacion.
3. **Sincronizacion:** comandos HTTP versionados, idempotentes y transaccionales. No se reproducen Server Actions desde una cola.

La primera version no intentara cachear las paginas protegidas actuales. La mayoria de los flujos core usa Server Components y acceso directo a servicios, por lo que cachear incidentalmente route handlers no los vuelve offline. Ademas, cachear HTML, RSC o JSON autenticado por `orgSlug` podria exponer datos entre usuarios del mismo navegador.

### Objetivo del vendedor

El vendedor debe poder:

- Instalar Rhinos en Android y iOS.
- Abrir una experiencia segura cuando no hay conexion.
- Descargar y actualizar sus datos de trabajo offline.
- Consultar clientes, productos, precios y stock de referencia.
- Crear y recuperar borradores aunque cierre la app.
- Enviar operaciones cuando vuelve la conectividad.
- Identificar operaciones pendientes, sincronizadas, fallidas o que requieren revision.
- Conocer la antiguedad de los datos mostrados.

### Fuera del alcance inicial

- Ventas confirmadas.
- Cobranzas y pagos.
- Movimientos o descarga de stock.
- Compras, despacho y operaciones financieras.
- Push notifications.
- Background Sync como requisito funcional.
- Caching offline generico de toda la aplicacion.

---

## 2. Decisiones de producto

Las decisiones necesarias para comenzar la Fase 0 y delimitar el MVP offline estan cerradas. La politica comercial detallada se validara durante el discovery previo a Fase 1.

Las decisiones necesarias para comenzar la Fase 0 ya estan cerradas y se documentan en la seccion 2.4.

### 2.1 Flujo comercial del MVP

El repositorio tiene dos flujos diferentes:

| Organizacion | Flujo | Ruta | Entidad |
|---|---|---|---|
| Sin modulo de produccion | Preventa | `/org/{slug}/preventa/nueva` | `sales_orders` en estado `DRAFT` |
| Con modulo de produccion | Presupuesto | `/org/{slug}/presupuestos/nuevo` | `quotes` |

No comparten completamente payload, permisos, reglas ni persistencia. Soportar ambos aumenta significativamente el alcance.

**Decision MVP:** soportar primero **preventa en organizaciones sin produccion**. Los presupuestos de organizaciones con produccion quedan para una etapa posterior.

### 2.2 Creacion de clientes offline

Crear clientes offline introduce IDs temporales, posibles CUIT duplicados y dependencias entre comandos.

**Decision MVP:** crear preventas solamente para clientes incluidos en el snapshot. El alta offline de clientes queda diferida hasta validar el flujo principal.

### 2.3 Politica inicial de sincronizacion

- La sincronizacion garantizada ocurre en foreground: al reconectar, abrir o reanudar la aplicacion.
- Background Sync puede usarse como mejora progresiva, nunca como requisito funcional.
- El servidor revalida precios, impuestos, permisos y referencias antes de crear la preventa.
- Una diferencia comercial nunca se acepta silenciosamente: pasa a `requires-review`.
- Un producto o cliente inactivo pasa a `requires-review` o rechazo tipado segun la regla de negocio.
- El stock offline se muestra como referencia con fecha de generacion, no como disponibilidad actual.
- El snapshot tendra inicialmente vigencia de una jornada laboral. El valor exacto sera configurable y se ajustara con datos del piloto.
- Los drafts pueden conservarse mas tiempo que el snapshot, pero deben actualizar sus referencias antes de enviarse.

Durante el discovery se cerraran los detalles de comparacion y presentacion de diferencias de precios, impuestos y descuentos.

### 2.4 Decisiones cerradas para Fase 0

| Tema | Definicion |
|---|---|
| Alcance del Service Worker | Global para toda la aplicacion |
| Promocion de instalacion | Solo usuarios con `sales.manage` o `sales.manage.all` y modulo `wholesale` |
| Nombre instalado | `Rhinos` |
| Inicio desde el icono | `/`, reutilizando la resolucion existente hacia la ultima organizacion accesible |
| Orientacion | Vertical y horizontal (`orientation: "any"`) |
| Fuente de iconos | `public/images/logo_solo.svg` |
| Colores | Derivados de la marca y de los tokens actuales de la aplicacion |
| Actualizaciones | Toast con confirmacion explicita; nunca recargar mientras el usuario completa un formulario |
| Fallback offline | Estado de conexion, explicacion del alcance actual y boton para reintentar |
| Promocion mobile | Banner discreto, descartable y exclusivo para vendedores habilitados |
| Android | Usar el prompt nativo cuando `beforeinstallprompt` este disponible |
| iOS | Mostrar instrucciones Share > Add to Home Screen |
| Version minima iOS | iOS 16.4 |
| Entornos | Produccion habilitada; previews habilitables mediante variable de entorno |
| Plataformas de aceptacion Fase 0 | Chrome Android y Safari iOS 16.4+ instalado en Home Screen |
| Observabilidad | Sentry con un proyecto nuevo dedicado a Rhinos y source maps privados |

### 2.5 PWA primero, cliente nativo condicionado

La PWA es la opcion inicial porque el repositorio actual permite reutilizar la mayor parte de la UI, autenticacion y servicios web. Una app Expo requeriria una nueva capa de presentacion y autenticacion mobile, aunque podria reutilizar contratos y logica pura.

La decision no es irreversible. Las piezas mas costosas se mantienen neutrales al cliente:

- Contratos TypeScript y schemas Zod.
- Snapshot del vendedor.
- Command API versionada.
- Idempotencia y transacciones.
- Clasificacion de conflictos.
- Pruebas de protocolo y reglas comerciales.

Se reconsiderara Expo solamente con evidencia del piloto, segun los criterios de la seccion 14.

### 2.6 Decisiones cerradas para Fase 1

| Tema | Definicion inicial |
|---|---|
| Cartera de clientes | Clientes activos asignados al vendedor y clientes activos sin vendedor asignado; usuarios con alcance global ven todos los clientes activos |
| Vigencia del snapshot | 12 horas, configurable despues de medir el piloto |
| Snapshot vencido | Se bloquea su uso para nuevas operaciones y se solicita actualizarlo |
| Purga en logout/cambio de cuenta | Inmediata y completa antes de finalizar la sesion |
| Purga por inactividad | 72 horas; se ejecuta al abrir o reanudar la PWA, ya que iOS no garantiza ejecucion con la aplicacion cerrada |
| Productos con variantes | Excluidos del MVP inicial |
| Habilitacion | Feature flag por organizacion, independiente de `NEXT_PUBLIC_PWA_ENABLED` |

La vigencia y la purga son controles diferentes. Un snapshot no puede utilizarse despues de 12 horas, aunque su eliminacion fisica por inactividad ocurra posteriormente. Al recuperar conexion tambien se debe purgar si la organizacion deshabilito la funcionalidad o el usuario perdio acceso.

---

## 3. Hallazgos del repositorio

### 3.1 Las pantallas core son principalmente Server Components

| Pantalla | Fuente principal |
|---|---|
| Clientes | Server Component + servicio directo |
| Stock | Server Component + servicio directo |
| Ventas/preventas | Server Component + servicio directo |
| Nueva preventa | Bootstrap desde Server Component |
| Detalle de venta | Server Component dinamico con `noStore()` |

Los filtros y la paginacion usan URL params y navegaciones con `shallow: false`. Por ello, cachear `/api/org/**` no permite reutilizar automaticamente esas pantallas offline.

### 3.2 Datos necesarios para una preventa

El formulario requiere mas que clientes y productos:

- Organizacion.
- Clientes visibles para el vendedor.
- Vendedores habilitados.
- Productos, unidades y variantes.
- Stock de referencia.
- Impuestos activos.
- Configuracion comercial de la organizacion.
- Metodos de pago y vencimientos.
- Listas de precios.
- Asignaciones de precio por cliente/proveedor.
- Configuracion de factura.

Estos datos deben exponerse mediante un contrato offline deliberado, no mediante caching accidental de requests visitadas.

### 3.3 SessionMonitor existente

`SessionMonitor` revisa la sesion cada cinco minutos y en eventos de foco/visibilidad. No distingue completamente entre falta de red y sesion invalida, ni emite actualmente un evento para reiniciar la cola luego del login.

La sincronizacion debe escuchar explicitamente:

- Recuperacion de conectividad util.
- Sesion autenticada valida.
- Cambio de usuario.
- Logout en otra pestana.

### 3.4 Navegacion mobile existente

`BottomNav` ofrece Ventas, Stock, Clientes y Salir, pero no aplica el mismo filtrado por permisos que el sidebar desktop. Antes del rollout vendedor debe alinearse su visibilidad con permisos y sumar acceso al estado de sincronizacion.

---

## 4. Principios de seguridad y consistencia

### 4.1 Limite de caching del Service Worker

El Service Worker puede guardar:

- `/~offline`.
- Manifest e iconos.
- JS/CSS fingerprinted de Next.js.
- Fuentes e imagenes publicas versionadas.

Debe tratar como `NetworkOnly`:

- `/org/**`.
- `/admin/**`.
- `/auth/**`.
- `/api/org/**`.
- Respuestas RSC/Flight.
- Requests con `_rsc`.
- Requests con headers `RSC`, `Next-Router-Prefetch` o `Next-Router-State-Tree`.
- Redirects de autenticacion.
- Respuestas con `private`, `no-store`, `Set-Cookie`, 401 o 403.

No se cacheara HTML protegido ni respuestas autenticadas genericas.

### 4.2 Particion de datos persistidos

Toda informacion offline debe pertenecer de forma inmutable a:

```text
schemaVersion + ownerUserId + organizationId
```

El `orgSlug` es una ruta, no una frontera de seguridad. No alcanza para separar datos.

### 4.3 Ciclo de vida de autenticacion

El logout centralizado debe:

1. Detener replay y nuevas escrituras.
2. Purgar snapshots y comandos del usuario segun la politica acordada.
3. Limpiar React Query y otros stores en memoria.
4. Solicitar al SW la limpieza de caches propias de la aplicacion.
5. Esperar confirmacion de purga.
6. Ejecutar `supabase.auth.signOut()`.
7. Navegar con reemplazo y refresh, o hard navigation.

Tambien debe ejecutarse ante cambio de cuenta y `SIGNED_OUT` en otra pestana.

### 4.4 El offline no equivale a autorizacion permanente

Una membresia revocada no puede invalidar instantaneamente datos ya descargados mientras el dispositivo esta sin red. Esto debe tratarse como una propiedad explicita del producto.

Mitigaciones:

- Snapshot con vencimiento.
- Revalidacion obligatoria al sincronizar.
- Purga al detectar revocacion.
- Minimizar campos almacenados.
- Evaluar cifrado local si se consideran dispositivos compartidos una amenaza relevante.

---

## 5. Arquitectura objetivo

```text
┌──────────────────────────────────────────────────────┐
│ Service Worker (Serwist)                             │
│                                                      │
│  App shell + assets + offline fallback + updates     │
│  No almacena HTML/RSC/API autenticada                │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Cliente                                              │
│                                                      │
│  IndexedDB                                           │
│  ├─ seller snapshots por user/org/version            │
│  ├─ drafts locales                                   │
│  └─ command queue                                    │
│                                                      │
│  OfflineSyncProvider                                 │
│  ├─ conectividad real                                │
│  ├─ estado de autenticacion                          │
│  ├─ lock multi-tab                                   │
│  └─ replay + backoff                                 │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Servidor                                             │
│                                                      │
│  GET  /api/v1/org/{slug}/seller-offline-snapshot     │
│  POST /api/v1/offline-commands                       │
│                                                      │
│  Shared command handlers                             │
│  ├─ autenticacion y permisos                         │
│  ├─ Zod schemas versionados                          │
│  ├─ idempotencia                                     │
│  ├─ revalidacion de referencias                      │
│  └─ transaccion/RPC atomica                          │
└──────────────────────────────────────────────────────┘
```

---

## 6. Fase 0 - Shell PWA seguro

**Estado:** implementada; validada manualmente en Safari iOS para shell e instalacion. Android y Sentry operativo pendientes.

### Objetivo

Hacer la aplicacion instalable, servir un fallback offline seguro y controlar actualizaciones. Esta fase no promete consulta de datos comerciales offline.

### Dependencias

Fijar versiones compatibles, no usar un rango ambiguo `9.5.x`:

```bash
pnpm add -D @serwist/turbopack@9.5.12 serwist@9.5.12 esbuild@^0.28 sharp
```

Se usa `useNativeEsbuild: true`, por eso se instala `esbuild` y no `esbuild-wasm`.

Agregar tambien `@sentry/nextjs` usando una version compatible con Next.js 16. La instalacion y configuracion deben seguir el setup oficial vigente al momento de implementar, sin ejecutar automaticamente cambios no auditados del wizard sobre archivos existentes.

### Archivos

| Archivo | Accion |
|---|---|
| `public/icons/pwa-192x192.png` | Crear |
| `public/icons/pwa-512x512.png` | Crear |
| `public/icons/pwa-192x192-maskable.png` | Crear |
| `public/icons/pwa-512x512-maskable.png` | Crear |
| `scripts/generate-pwa-icons.mjs` | Crear |
| `src/app/manifest.ts` | Crear |
| `src/app/serwist/[path]/route.ts` | Crear |
| `src/app/sw.ts` | Crear |
| `src/app/~offline/page.tsx` | Crear |
| `src/components/serwist/serwist-provider.tsx` | Crear |
| Componente de promocion de instalacion mobile | Crear |
| Configuracion cliente/servidor/edge de Sentry | Crear |
| `next.config.ts` | Modificar |
| Proxy activo | Modificar matcher |
| `src/app/layout.tsx` | Modificar |

### Proxy de Next.js 16

Next.js 16 usa `proxy.ts`, no `middleware.ts`. El repositorio contiene `proxy.ts` y `src/proxy.ts`; antes de editar se debe determinar cual es el activo y resolver la duplicidad.

El matcher debe excluir `/serwist/`, iconos y assets requeridos para instalar/cargar el SW. El script del SW debe ser publicamente recuperable y no puede redirigir a login.

### Route handler

```ts
import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

const gitRevision = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf-8",
}).stdout.trim();

const revision = gitRevision || crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
```

### Runtime caching minimo

No usar `defaultCache` sin filtrar: en produccion incluye una regla generica `NetworkFirst` para GET `/api/`, ademas de HTML y RSC. Eso contradice el limite seguro definido en este plan.

Crear una lista minima con:

- Assets `_next/static` fingerprinted: `CacheFirst`.
- Fuentes e imagenes publicas: estrategia y TTL acotados.
- Documentos protegidos y APIs: `NetworkOnly`.
- Fallback `/~offline` para navegaciones sin respuesta.

### Lifecycle de actualizaciones

Configuracion del worker:

```ts
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});
```

El wrapper debe usar `useSerwist()` y escuchar:

- `waiting`: mostrar toast y llamar `serwist.messageSkipWaiting()` al aceptar.
- `controlling`: recargar la pagina.

Configurar explicitamente:

```tsx
<SerwistProvider
  swUrl="/serwist/sw.js"
  reloadOnOnline={false}
>
  {children}
</SerwistProvider>
```

`reloadOnOnline={false}` evita perder formularios cuando vuelve la red.

### Alcance y habilitacion por entorno

El Service Worker se registra globalmente para evitar estados inconsistentes entre rutas y cuentas. La promocion de instalacion, en cambio, se muestra solamente cuando:

- La pantalla es mobile.
- La organizacion tiene habilitado el modulo `wholesale`.
- El usuario posee `sales.manage` o `sales.manage.all`.
- La aplicacion no esta ejecutandose ya en modo `standalone`.
- El usuario no descarto recientemente el banner.

Produccion registra el SW por defecto. Los entornos preview deben habilitarlo mediante una variable publica explicita, por ejemplo:

```text
NEXT_PUBLIC_PWA_ENABLED=true
```

En entornos no habilitados, el provider no debe registrar el SW. Si existe un registro anterior del mismo origen de preview, el proceso de QA debe incluir su limpieza.

### Promocion de instalacion

El banner mobile debe ser discreto y descartable:

- Android/Chromium: capturar `beforeinstallprompt`, mostrar el CTA y disparar el prompt solamente por accion del usuario.
- iOS 16.4+: mostrar instrucciones visuales para Share > Add to Home Screen; iOS no implementa `beforeinstallprompt`.
- Ocultar el banner cuando `display-mode: standalone` indique que la PWA ya esta instalada.
- No bloquear navegacion ni formularios.
- Persistir el descarte local con una vigencia definida durante la implementacion.
- Registrar en Sentry solamente eventos tecnicos y de interaccion, sin datos comerciales ni personales.

### Manifest

- `name: "Rhinos"`.
- `short_name: "Rhinos"`.
- `display: "standalone"`.
- `start_url: "/"`.
- `scope: "/"`.
- `orientation: "any"`.
- Iconos 192, 512 y variantes maskable.
- Iconos generados desde `public/images/logo_solo.svg`.
- `theme_color` y `background_color` derivados de la marca y tokens actuales.

La ruta `/` debe conservar la resolucion existente hacia la ultima organizacion accesible. No se codifican slugs dentro del manifest.

### Fallback offline

`/~offline` debe mostrar:

- Identidad visual de Rhinos.
- Estado claro: "Sin conexion".
- Explicacion de que los datos comerciales offline se incorporan en fases posteriores.
- Boton "Reintentar" que intente navegar nuevamente a la URL solicitada o recargue la aplicacion.
- Indicador que reaccione a eventos `online`/`offline`, sin asumir que `navigator.onLine` garantiza acceso al servidor.

No debe mostrar links a Clientes, Stock o Ventas hasta que esas experiencias tengan un repositorio local funcional.

### Verificacion

1. Manifest valido e instalable en Chrome Android.
2. Instalacion manual real en Safari iOS 16.4+ mediante Share > Add to Home Screen.
3. SW servido como JavaScript sin redirects.
4. `/~offline` disponible sin conexion.
5. Ninguna API, pagina protegida o respuesta RSC en Cache Storage.
6. Update waiting muestra toast y recarga solo al aceptar.
7. El banner solo aparece para usuarios con `sales.manage` o `sales.manage.all`, modulo `wholesale` y pantalla mobile.
8. El banner se oculta en modo standalone y respeta el descarte del usuario.
9. Produccion registra el SW y preview respeta `NEXT_PUBLIC_PWA_ENABLED`.
10. Sentry recibe errores/eventos de prueba con source maps privados correctamente simbolizados.
11. `pnpm lint` y `pnpm build` sin errores.

### Desarrollo local

```bash
# SW en desarrollo; localhost ya es secure context
pnpm dev

# HTTPS de desarrollo para probar desde otro dispositivo
pnpm dev --experimental-https

# Precache y bundle de produccion
pnpm build
pnpm start
```

`--experimental-https` no es una opcion valida de `next start`. Para probar el build desde un telefono se requiere un proxy/tunel HTTPS o un certificado confiable por el dispositivo.

---

## 7. Fase 1 - Snapshot offline del vendedor

**Estado:** implementada e integrada con IndexedDB, borradores y revalidacion de comandos.

### Objetivo

Descargar de forma explicita el conjunto minimo de datos necesario para trabajar. No depende de haber visitado previamente cada pantalla.

### Discovery previo

Antes de cerrar el contrato se medira en organizaciones representativas:

- Clientes visibles por vendedor.
- Productos y variantes.
- Listas de precios y asignaciones especiales.
- Tamano del JSON sin comprimir y transferido.
- Tiempo de generacion y descarga en redes moviles.
- Espacio utilizado en dispositivos Android e iOS.
- Frecuencia y duracion habitual del trabajo sin conexion.

Con estos datos se decidira si el MVP usa snapshot completo o necesita descarga incremental desde el inicio.

Decisiones iniciales para realizar la medicion:

- Incluir clientes activos asignados al vendedor y sin vendedor asignado.
- Usar una vigencia provisional de 12 horas.
- Excluir productos con variantes.
- Limitar la descarga a organizaciones con el feature flag offline habilitado.

### Endpoint

```text
GET /api/v1/org/{orgSlug}/seller-offline-snapshot
```

Contrato inicial:

```ts
type SellerOfflineSnapshotV1 = {
  schemaVersion: 1;
  snapshotId: string;
  generatedAt: string;
  expiresAt: string;
  ownerUserId: string;
  organizationId: string;
  organization: OfflineOrganization;
  customers: OfflineCustomer[];
  products: OfflineProduct[];
  taxes: OfflineTax[];
  sellers: OfflineSeller[];
  salesPriceLists: OfflinePriceList[];
  customerPriceAssignments: OfflineAssignment[];
  settings: OfflineSalesSettings;
};
```

El endpoint debe:

- Autenticar al usuario actual.
- Resolver la organizacion por membresia, no confiar en el slug.
- Aplicar permisos y cartera del vendedor.
- Devolver solo campos necesarios.
- Excluir datos financieros y transaccionales no requeridos.
- Limitar tamanos y responder una version de esquema.
- Generar el snapshot de forma consistente.

### Persistencia

IndexedDB debe separar stores o claves por:

```text
ownerUserId + organizationId + schemaVersion
```

No almacenar tokens ni credenciales dentro del snapshot.

El repositorio local debe guardar la ultima actividad. Debe purgar datos inmediatamente ante logout o cambio de cuenta y, al abrir o reanudar la aplicacion, cuando hayan transcurrido 72 horas sin actividad. No se promete una purga temporizada mientras la PWA esta cerrada o suspendida en iOS.

### UX

- Accion explicita: "Preparar datos sin conexion".
- Estado y progreso de descarga.
- "Datos actualizados hace X" siempre visible offline.
- Boton "Actualizar datos".
- Aviso si el snapshot esta vencido.
- Stock rotulado como referencia, nunca como disponibilidad en tiempo real.
- Bloqueo de nuevas operaciones si el snapshot supera la antiguedad maxima definida.

### Pantallas offline

No reutilizar mediante cache las paginas Server Component actuales. Crear una capa cliente que lea del snapshot para:

- Buscar y seleccionar clientes.
- Buscar productos.
- Consultar precio e impuesto de referencia.
- Construir un borrador de preventa.

Online, las pantallas existentes pueden seguir usando Server Components. Offline, la aplicacion debe entrar deliberadamente en modo offline y usar el repositorio local.

### Actualizacion incremental

Para el MVP puede descargarse un snapshot completo. Si el volumen real lo exige, incorporar despues:

- Cursor o `updatedSince`.
- Tombstones para registros desactivados/eliminados.
- ETag o version de dataset.
- Compresion.

Primero se debe medir el volumen por vendedor y organizacion.

### Verificacion

1. Un vendedor solo recibe su cartera permitida.
2. Dos usuarios del mismo browser no leen snapshots ajenos.
3. Cambiar de organizacion no mezcla datasets.
4. Logout purga o bloquea los datos segun la politica.
5. Snapshot vencido se identifica correctamente.
6. La app puede abrir, buscar clientes/productos y preparar un borrador sin red.
7. No se almacenan respuestas HTML/RSC protegidas.

---

## 8. Fase 2 - Borradores locales

**Estado:** implementada, incluida migracion/revision al reemplazar el snapshot.

### Objetivo

Evitar perdida de trabajo antes de implementar envio automatico.

### Modelo

```ts
type OfflineDraft<T> = {
  draftId: string;
  schemaVersion: 1;
  ownerUserId: string;
  organizationId: string;
  snapshotId: string;
  type: "preSale.create";
  status: "draft" | "queued" | "syncing" | "requires-review" | "failed" | "synced";
  createdAt: string;
  updatedAt: string;
  payload: T;
};
```

### Requisitos

- Autosave local con debounce.
- Recuperacion tras cerrar o refrescar la app.
- Edicion y eliminacion antes de encolar.
- Validacion Zod al guardar y volver a leer.
- Migracion o rechazo explicito de schemas viejos.
- No almacenar `File`, funciones, clases ni objetos no serializables.

### Verificacion

- Cerrar la PWA durante una preventa y recuperar exactamente el formulario.
- Corromper un registro de prueba y mostrar un error controlado.
- Actualizar la app con borradores viejos y ejecutar la politica de migracion.

---

## 9. Fase 3 - Comandos offline y sincronizacion

**Estado:** implementada tecnicamente. No se han ejecutado integraciones contra una base Supabase real ni la aceptacion mobile completa.

### Objetivo

Enviar operaciones de forma durable, sin duplicados y con conflictos visibles.

### No reproducir Server Actions

Los Server Actions usan identificadores y protocolo internos del build. No son un contrato durable para comandos guardados durante horas o dias. Se mantiene su uso para UI online inmediata, pero no para replay persistido.

### Endpoint estable

```text
POST /api/v1/offline-commands
```

```ts
type OfflineCommandV1 = {
  commandId: string;
  schemaVersion: 1;
  type: "preSale.create";
  ownerUserId: string;
  organizationId: string;
  orgSlugAtCreation: string;
  snapshotId: string;
  createdAt: string;
  payload: CreatePreSaleCommandV1;
};
```

`ownerUserId` y `organizationId` permiten detectar inconsistencias, pero el servidor siempre deriva y valida la identidad desde la sesion actual.

### Respuesta estable

```ts
type OfflineCommandResult =
  | {
      ok: true;
      commandId: string;
      resourceId: string;
      duplicate: boolean;
    }
  | {
      ok: false;
      code:
        | "AUTH_REQUIRED"
        | "FORBIDDEN"
        | "VALIDATION_ERROR"
        | "STALE_REFERENCE"
        | "REVIEW_REQUIRED"
        | "RETRYABLE";
      message: string;
      retryable: boolean;
      fieldErrors?: Record<string, string[]>;
      changes?: CommercialChange[];
    };
```

### Idempotencia

Cada comando obtiene un UUID antes de entrar a la cola. La base debe imponer una restriccion equivalente a:

```sql
UNIQUE (organization_id, command_id)
```

Si el request se proceso pero la respuesta se perdio, el reintento devuelve el `resourceId` original con `duplicate: true`.

### Transaccion

La creacion de preventa debe ejecutarse en una sola transaccion/RPC que incluya:

1. Reclamo idempotente del comando.
2. Validacion de usuario, organizacion y permisos.
3. Validacion de cliente, vendedor, productos, impuestos y listas.
4. Reglas de vigencia y diferencias comerciales.
5. Insert de orden DRAFT.
6. Insert de items.
7. Insert de snapshots de impuestos.
8. Persistencia del resultado del comando.

Cualquier error revierte toda la operacion.

La implementacion endurecida vive en la migracion aditiva `20260921120000_harden_offline_pre_sale_replay.sql`. La consulta de replay completado se ejecuta como usuario autenticado y valida `auth.uid()`, propietario y hash. La escritura atomica `create_offline_pre_sale_atomic(uuid,jsonb)` esta concedida solo a `service_role`: el servidor autentica con sesion, genera un snapshot fresco, verifica que usuario y organizacion coincidan y recien entonces suministra el actor verificado a la RPC.

### Validacion

Definir schemas Zod compartidos y versionados. Validar:

- Antes de guardar el draft.
- Antes de encolar.
- Al recibir el comando en servidor.
- Dentro del handler antes de persistir.

El servidor debe rechazar IDs de otra organizacion, entidades inactivas, numeros no finitos, strings fuera de limite y enums invalidos.

### Estados y politica de errores

| Resultado | Estado/accion |
|---|---|
| Red ausente o timeout | Mantener `queued`; backoff |
| `AUTH_REQUIRED` | Pausar; no contar como fallo permanente |
| `FORBIDDEN` | `failed`; requiere intervencion |
| `VALIDATION_ERROR` | `failed`; mostrar campos |
| `STALE_REFERENCE` | `requires-review` |
| Cambio de precio/impuesto | `requires-review`; mostrar diferencias |
| `RETRYABLE` o 5xx | Reintentar con backoff y limite |
| Comando ya procesado | `synced` con resource ID original |

No se elimina una operacion hasta recibir `ok: true`.

### Coordinacion de replay

`navigator.onLine` es una señal orientativa, no prueba acceso al servidor. El replay debe:

- Comprobar conectividad contra un endpoint real.
- Esperar una sesion autenticada valida.
- Usar Web Locks API cuando este disponible.
- Usar `BroadcastChannel` para comunicar estados entre pestanas.
- Evitar dos replays simultaneos.
- Reintentar con backoff y jitter.
- Reanudarse ante login confirmado, no solamente ante evento `online`.

No se usa Background Sync como dependencia porque no es interoperable: no esta disponible en Safari/iOS ni Firefox.

La implementacion lista todos los comandos del propietario, sin depender de la organizacion o snapshot activos. Usa timeout de 15 segundos, leases de 60 segundos, Web Lock particionado por propietario, single-flight, backoff exponencial con jitter y finalizacion monotona que no degrada `synced`. Los exitos se conservan siete dias; el trabajo no resuelto no se purga por esa retencion.

### UI de sincronizacion

Mostrar en sidebar y `BottomNav`:

- Cantidad pendiente.
- Cantidad que requiere revision.
- Fallos permanentes.
- Ultima sincronizacion.

Drawer o pantalla de detalle:

- Drafts.
- En cola.
- Sincronizando.
- Requieren revision, con diferencias.
- Fallidas, con codigo y mensaje sanitizado.
- Sincronizadas recientemente.
- Reintentar, editar o eliminar segun estado.

La bandeja implementada confirma revision/edicion y eliminacion, explica que borrar localmente no cancela trabajo aceptado por servidor y evita eliminar mientras el comando esta `syncing`. Al reemplazar el snapshot, los borradores se revalidan y migran de forma explicita antes de generar un comando nuevo.

### Refresh de Ventas

Al sincronizar, el cliente publica un evento particionado por usuario y organizacion mediante `BroadcastChannel` y `localStorage`. `OfflineSalesRefresh` invalida queries y refresca la ruta de Ventas al montar, navegar, volver a visibilidad, restaurar BFCache o recibir eventos de canal/storage. Solo acepta eventos de la misma cuenta, organizacion y slug con antiguedad maxima de 24 horas.

### Verificacion

1. Respuesta perdida despues del commit no crea duplicados.
2. Dos pestanas no procesan el mismo comando simultaneamente.
3. Deploy entre enqueue y replay sigue funcionando.
4. Logout/login con otro usuario no reproduce comandos ajenos.
5. Cambio de organizacion no altera la organizacion del comando.
6. Sesion expirada pausa y reanuda luego del login.
7. Producto inactivo o precio cambiado requiere revision.
8. Un fallo en items/impuestos revierte la orden completa.
9. Payload viejo o corrupto no se envia sin validacion.
10. iOS suspendiendo/cerrando la PWA no pierde drafts ni comandos.

---

## 10. Fase 4 - Alta de clientes offline (post-MVP)

Una vez estable el flujo de preventa:

- Agregar comando `customer.create`.
- Usar `commandId` idempotente.
- Normalizar CUIT en servidor.
- Agregar constraint de unicidad por organizacion cuando la regla de negocio lo permita.
- Validar lista de precios, transportista y vendedor contra la organizacion.
- Definir IDs temporales y dependencias si se permite usar el cliente nuevo en una preventa aun no sincronizada.

Para soportar cliente + preventa encadenados, la cola necesita dependencias explicitas:

```ts
dependsOnCommandIds: string[]
```

El resultado del alta debe resolver el ID temporal antes de enviar la preventa.

---

## 11. Testing requerido

### Funcional

- Instalar, cerrar y reabrir PWA.
- Cold start offline.
- Snapshot completo y vencido.
- Autosave y recuperacion de drafts.
- Replay luego de varias horas/dias.
- Conflictos comerciales.
- Cuenta y organizacion incorrectas.

### Seguridad

- Usuario A descarga datos, sale, ingresa usuario B.
- Usuarios distintos de la misma organizacion.
- Cambio y revocacion de permisos.
- Membresia eliminada.
- Manipulacion manual de IndexedDB.
- Respuestas 401, 403 y redirects nunca cacheadas.
- Cache Storage sin HTML, RSC o JSON protegido.

### Resiliencia

- Corte antes de enviar.
- Corte durante request.
- Commit exitoso con respuesta perdida.
- Error parcial dentro de la transaccion.
- Dos pestanas y dos ventanas PWA.
- Deploy con comandos pendientes.
- Storage lleno o eliminado por el sistema.
- Suspension agresiva en iOS.

### Plataformas

- Chrome Android.
- Safari iOS 16.4+ instalado en Home Screen.
- Chrome/Edge desktop.
- Firefox como navegador sin Background Sync.

---

## 12. Observabilidad

### Sentry en Fase 0

Se creara un proyecto Sentry nuevo dedicado a Rhinos. La configuracion debe cubrir runtime de navegador y servidor, incluyendo errores relacionados con registro y lifecycle del Service Worker que puedan observarse desde la pagina.

Variables requeridas:

```text
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- `NEXT_PUBLIC_SENTRY_DSN` se configura en produccion y previews controladas.
- `SENTRY_AUTH_TOKEN` se almacena exclusivamente como secreto de CI.
- Los source maps se suben de forma privada durante el build y no se sirven publicamente.
- Separar los environments `production` y `preview`.
- No enviar payloads comerciales, datos de clientes, tokens, cookies ni contenido de IndexedDB.
- Configurar sanitizacion de URLs, breadcrumbs y request data antes del rollout.

Eventos minimos de Fase 0:

- Soporte/no soporte de Service Worker.
- Registro exitoso o fallido.
- Nueva version en estado `waiting`.
- Actualizacion aceptada y control adquirido.
- Banner de instalacion mostrado, descartado o aceptado.
- Prompt Android disponible y resultado informado por el navegador.
- Instrucciones de instalacion iOS mostradas.
- Fallback offline mostrado y reintento solicitado.

La instalacion efectiva no puede detectarse de forma uniforme en todas las plataformas. En iOS se registran las instrucciones mostradas y ejecucion en `standalone`, no se afirma una instalacion confirmada si el navegador no expone esa señal.

### Sincronizacion en fases posteriores

Registrar en servidor sin incluir payloads sensibles completos:

- `commandId`.
- `organizationId`.
- Tipo y version del comando.
- Resultado y codigo de error.
- Cantidad de reintentos.
- Tiempo entre creacion y sincronizacion.
- Correlation ID para errores internos.

Metricas sugeridas:

- Snapshots descargados y fallidos.
- Edad promedio del snapshot al crear una operacion.
- Drafts recuperados.
- Tasa de sincronizacion exitosa.
- Duplicados resueltos por idempotencia.
- Operaciones `requires-review`.
- Tiempo hasta sincronizacion.

---

## 13. Rollout

1. Crear el proyecto Sentry y configurar DSN, organizacion, proyecto y token de CI.
2. Habilitar el shell PWA global en preview controlada.
3. Validar banner con usuarios que pueden y no pueden gestionar ventas.
4. Validar Chrome Android y Safari iOS 16.4+ Home Screen.
5. Habilitar el shell PWA global en produccion.
6. Usar feature flag por organizacion/usuario para snapshots y operaciones offline de fases posteriores.
7. Piloto interno de datos offline con una organizacion pequena.
8. Validar volumen real del snapshot y tiempos de descarga.
9. Habilitacion gradual de sincronizacion.
10. Push notifications y otros flujos solo despues de estabilizar sync.

Debe existir un kill switch que desactive nuevas operaciones offline sin borrar drafts existentes.

---

## 14. Evaluacion del piloto y criterio de Expo

La PWA sera evaluada con evidencia de campo. Se reconsiderara una app Expo/React Native si aparece uno o mas de estos problemas de forma material:

- Muchas operaciones permanecen pendientes porque los usuarios cierran la PWA y no vuelven a abrirla a tiempo.
- Rendimiento insuficiente en busquedas o formularios con los catalogos reales.
- Instalacion o retencion insuficiente en iOS.
- Necesidad frecuente de camara o escaneo de codigos con baja latencia.
- Necesidad de fotos, firmas, GPS, archivos locales o compartir PDFs de forma intensiva.
- Integracion con impresoras Bluetooth, terminales, scanners u otros perifericos.
- Requisito de MDM, distribucion empresarial o almacenamiento local cifrado.
- Necesidad contractual de mayores oportunidades de ejecucion en segundo plano.

Metricas del piloto:

- Distribucion Android/iOS y version de sistema.
- Tasa de instalacion y ejecucion en standalone.
- Tamano y duracion de descarga del snapshot.
- Tiempo promedio y maximo sin conexion.
- Cantidad y edad de comandos pendientes.
- Tiempo hasta sincronizacion.
- Porcentaje de operaciones `requires-review`.
- Errores de almacenamiento, eviction y cuota.
- Frecuencia real de necesidades nativas.

Si estos limites no son operativamente relevantes, se mantiene una sola aplicacion web. Si lo son, la app Expo reutilizara el backend y protocolo ya construidos.

---

## 15. Vertical slice del MVP

Despues de Fase 0 no se construiran todas las capacidades horizontales por separado. Se implementara un flujo completo y reducido:

1. Descargar datos minimos del vendedor.
2. Consultar antiguedad del snapshot.
3. Seleccionar un cliente existente.
4. Buscar y agregar productos.
5. Calcular una preventa.
6. Guardar y recuperar el draft local.
7. Encolar el comando.
8. Sincronizar mediante la Command API.
9. Mostrar exito, retry o diferencias comerciales.

Este vertical slice debe probarse en Android e iOS antes de ampliar el snapshot, agregar clientes offline o soportar presupuestos de produccion.

---

## 16. Estimacion revisada

La estimacion se expresa en semanas-persona, no necesariamente tiempo calendario. Incluye snapshot dedicado, idempotencia, transacciones y conflictos basicos.

| Etapa | Estimacion |
|---|---|
| Shell PWA seguro | 1-2 dias |
| Discovery + contrato de snapshot | 2-4 dias |
| Snapshot + repositorio local + UX | 5-8 dias |
| Borradores locales | 3-5 dias |
| Command API + schemas + idempotencia | 5-8 dias |
| RPC/transaccion de preventa | 3-5 dias |
| Replay, auth, locks y UI | 5-8 dias |
| QA Android/iOS + hardening | 5-8 dias |
| **Piloto funcional acotado** | **6-10 semanas-persona** |
| **MVP robusto de produccion** | **14-26 semanas-persona** |

No incluye presupuestos de produccion ni alta de clientes offline.

---

## 17. Criterios de exito del MVP

- Cero datos de otro usuario u organizacion visibles despues de logout/switch.
- Cero duplicados frente a reintentos o respuestas perdidas.
- Cero ordenes parciales por fallos de items/impuestos.
- Borradores recuperables despues de cerrar la app.
- Vendedor puede preparar y enviar una preventa con conectividad intermitente.
- Conflictos de precio, impuesto o referencia nunca se aceptan silenciosamente.
- La UI muestra claramente antiguedad de datos y estado de sincronizacion.
- Flujo verificado en Android e iOS instalado.

---

## 18. Orden recomendado de implementacion

1. Crear/configurar el proyecto Sentry.
2. Implementar Fase 0 sin caching autenticado.
3. Medir volumen y definir schema del snapshot.
4. Implementar el vertical slice del MVP.
5. Ejecutar el piloto Android/iOS y medir los criterios de la seccion 14.
6. Corregir limites de rendimiento, instalacion y sincronizacion.
7. Completar hardening para produccion.
8. Evaluar clientes offline, presupuestos de produccion y push.
9. Reconsiderar Expo solo si las metricas del piloto lo justifican.

---

*Plan revisado: septiembre 2026.*
