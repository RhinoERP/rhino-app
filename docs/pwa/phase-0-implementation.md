# Fase 0 - Implementacion del shell PWA

> **Estado:** implementacion tecnica completa y validada manualmente en Safari iOS. Pendientes Android, pruebas complementarias y activacion del proyecto Sentry.
>
> **Fecha:** 2026-09-11.

## Alcance implementado

- Manifest instalable `Rhinos`.
- Iconos PNG normales y maskable generados desde el isotipo existente.
- Service Worker compilado por Serwist con Turbopack.
- Precache del fallback offline y assets del build.
- Runtime cache limitado a assets publicos.
- APIs, rutas protegidas y requests RSC configurados como `NetworkOnly`.
- Fallback `/~offline` con estado de conectividad y reintento.
- Lifecycle de actualizacion con confirmacion explicita.
- Captura temprana de `beforeinstallprompt` desde el layout raiz.
- Banner mobile para usuarios que pueden gestionar ventas.
- Instrucciones especificas para instalacion en iOS.
- Integracion base de Sentry para cliente, servidor y edge.
- Source maps privados preparados para CI.
- Flag de habilitacion para previews.

## Dependencias

```text
@serwist/turbopack 9.5.12
serwist 9.5.12
esbuild 0.28.x
sharp 0.35.x
@sentry/nextjs 10.74.x
import-in-the-middle
require-in-the-middle
```

`import-in-the-middle` y `require-in-the-middle` son dependencias directas para que Turbopack pueda resolver la instrumentacion Node utilizada por Sentry en el output del servidor.

`pnpm-workspace.yaml` autoriza los scripts de build de `@sentry/cli`, `@swc/core`, `esbuild` y `sharp` requeridos por estas herramientas.

## Archivos creados

| Archivo | Responsabilidad |
|---|---|
| `src/app/manifest.ts` | Manifest generado por Next.js |
| `src/app/sw.ts` | Worker y limite de runtime caching |
| `src/app/serwist/[path]/route.ts` | Compilacion/entrega de `/serwist/sw.js` |
| `src/app/~offline/page.tsx` | Fallback offline publico |
| `src/components/serwist/serwist-provider.tsx` | Registro y lifecycle de updates |
| `src/components/pwa/pwa-provider.tsx` | Estado global de instalacion |
| `src/components/pwa/pwa-install-banner.tsx` | Promocion mobile por permisos |
| `src/lib/pwa-telemetry.ts` | Eventos tecnicos PWA hacia Sentry |
| `src/instrumentation.ts` | Registro de instrumentacion server/edge |
| `src/instrumentation-client.ts` | Inicializacion Sentry en navegador |
| `src/sentry.server.config.ts` | Configuracion Sentry Node |
| `src/sentry.edge.config.ts` | Configuracion Sentry Edge |
| `src/app/global-error.tsx` | Captura de errores globales |
| `scripts/generate-pwa-icons.mjs` | Generacion reproducible de iconos |
| `public/icons/pwa-*.png` | Iconos instalables |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `next.config.ts` | Composicion `withSerwist` + `withSentryConfig` |
| `src/app/layout.tsx` | Providers globales, manifest y apple icon |
| `src/app/org/[orgSlug]/layout.tsx` | Banner de instalacion dentro de permisos |
| `proxy.ts` | Exclusion de `/serwist/`, `/~offline` y `/manifest.webmanifest` |
| `src/proxy.ts` | Exclusion defensiva de rutas PWA publicas mientras se resuelve la duplicidad existente |
| `.env.example` | Variables PWA y Sentry |
| `package.json` / `pnpm-lock.yaml` | Dependencias |
| `pnpm-workspace.yaml` | Scripts de instalacion autorizados |

## Habilitacion

El registro usa esta precedencia:

1. Si `NEXT_PUBLIC_PWA_ENABLED` esta definido, `true` habilita y `false` deshabilita.
2. Sin configuracion explicita, Vercel habilita solamente `VERCEL_ENV=production`.
3. Fuera de Vercel, un build de produccion habilita la PWA.
4. Desarrollo queda deshabilitado por defecto.

Para una preview controlada:

```text
NEXT_PUBLIC_PWA_ENABLED=true
```

## Limite de caching

No se utiliza `defaultCache` de Serwist porque incluye caching generico de APIs, paginas y RSC.

Runtime cache permitido:

- `/_next/static/**`.
- `/images/**`.
- `/icons/**`.

Runtime `NetworkOnly` explicito:

- `/api/**`.
- `/org/**`.
- `/admin**`.
- `/auth/**`.
- Requests con `_rsc`.
- Headers `RSC`, `Next-Router-Prefetch` o `Next-Router-State-Tree`.
- Toda navegacion de documento del mismo origen, incluida `/`.

El fallback responde `/~offline` cuando una navegacion de documento falla, incluso durante un cold start en `/`, pero no persiste la pagina protegida solicitada.

## Instalacion

El prompt se captura globalmente para evitar perder `beforeinstallprompt` mientras se resuelve el layout de organizacion.

El banner se muestra solo si:

- El viewport es mobile.
- El modulo `wholesale` esta habilitado.
- El usuario tiene `sales.manage`, `sales.manage.all` o `organization.admin` mediante el helper actual de permisos.
- La app no se ejecuta en `display-mode: standalone`.
- El banner no fue descartado durante los ultimos siete dias.
- Android expuso el prompt o el dispositivo es iOS.

En iOS se muestran instrucciones Share > Add to Home Screen. No se intenta usar `beforeinstallprompt` porque WebKit no lo implementa.

## Actualizaciones

- `skipWaiting: false`: el worker nuevo espera.
- Evento `waiting`: toast persistente "Nueva version disponible".
- Accion "Actualizar": `messageSkipWaiting()`.
- `clientsClaim: true`: el worker activado toma control.
- Evento `controlling`: recarga una sola vez con el nuevo build.
- `reloadOnOnline: false`: recuperar conexion no recarga formularios.
- `cacheOnNavigation: false`: el provider no solicita cachear navegaciones protegidas.

## Sentry

Variables pendientes de completar al crear el proyecto:

```text
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

`SENTRY_AUTH_TOKEN` debe existir solo como secreto de CI. La configuracion elimina source maps del output publico despues de subirlos.

La instrumentacion deshabilita envio cuando no hay DSN y elimina cookies, headers y request data antes de reportar eventos. Los eventos PWA no incluyen datos comerciales ni payloads de IndexedDB.

## Comandos

```bash
# Regenerar iconos
node scripts/generate-pwa-icons.mjs

# Desarrollo local (PWA deshabilitada por defecto)
pnpm dev

# Preview local habilitada
NEXT_PUBLIC_PWA_ENABLED=true pnpm dev

# Validacion de produccion
pnpm lint
pnpm build
pnpm start
```

## Validacion automatizada

| Verificacion | Estado |
|---|---|
| TypeScript `tsc --noEmit` | OK |
| `pnpm lint` (Biome) | OK, 1195 archivos |
| Build Turbopack | OK |
| Manifest generado | OK |
| `/~offline` estatico | OK |
| `/serwist/sw.js` generado | OK |
| Precache de produccion generado | OK |
| Rutas publicas sin redireccion (manifest, offline, sw.js, iconos) | OK |
| Rutas protegidas redirigen a login (`/org/**`) | OK |
| SW incluye matcher de rutas protegidas (`/api/`, `/org/`, `/admin`) | OK |

Validacion HTTP en build de produccion (`next start`):

| Ruta | Respuesta esperada | Resultado |
|---|---|---|
| `/manifest.webmanifest` | 200 publico | 200 |
| `/~offline` | 200 publico | 200 |
| `/serwist/sw.js` | 200 + `service-worker-allowed: /` | 200 |
| `/icons/pwa-192x192.png` | 200 publico | 200 |
| `/org/acme/clientes` | 307 a login | 307 |

El build genero 178 entradas de precache, aproximadamente 10 MB. Serwist excluyo `public/images/logo_solo.svg` por superar su limite de tamano; el fallback usa el PNG PWA reducido, por lo que no depende de ese SVG offline.

## Validacion manual pendiente

- Crear proyecto Sentry y cargar credenciales.
- Confirmar eventos y simbolizacion de source maps en preview.
- Chrome Android: instalacion, standalone, fallback y update.
- Confirmar que Cache Storage no contiene API, HTML protegido ni RSC.
- Probar cuenta sin permisos de ventas y organizacion sin `wholesale`.
- Probar descarte del banner durante siete dias.
- Simular un segundo deploy y aceptar/rechazar el toast de update.

## Validacion manual realizada

- Safari iOS en iPhone: acceso mediante tunel HTTPS, instrucciones de instalacion, Add to Home Screen, ejecucion standalone y experiencia del shell confirmadas el 2026-09-14.
- El alcance offline observado coincide con Fase 0: fallback seguro sin navegacion ni datos comerciales persistidos.

## Hallazgos y deuda conocida

- El repositorio ya contenia `proxy.ts` y `src/proxy.ts`. Ambos se actualizaron para no dejar una ruta insegura, pero se debe confirmar y conservar una sola convencion en una tarea separada.
- El SVG fuente pesa aproximadamente 2.19 MB. Sirve para regenerar iconos, pero no debe utilizarse como asset offline principal.
- La telemetria no enviara eventos hasta configurar el DSN.
- Fase 0 no ofrece datos comerciales offline; esa capacidad comienza con el snapshot de Fase 1.
