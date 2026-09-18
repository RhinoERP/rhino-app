# Plan PWA — Rhinos App

> **Propósito:** Convertir Rhinos en una Progressive Web App instalable, con capacidades offline y notificaciones push nativas, orientada al vendedor en campo.

---

## 1. Visión

Un vendedor en ruta abre Rhinos en el celular, lo instala como app, y puede:

- Ver su cartera de clientes, productos y precios sin conexión
- Crear presupuestos aunque esté sin señal — se sincronizan solos al reconectar
- Recibir notificaciones push cuando un pedido cambia de estado, sin tener la app abierta
- Saber exactamente qué operaciones están pendientes de sincronizar

**No buscamos** hacer Rhinos 100% funcional offline. Las ventas confirmadas, cobranzas, descarga de stock y demás operaciones transaccionales requieren conectividad. Sí buscamos que el vendedor nunca se quede bloqueado.

---

## 2. Arquitectura general

```
Serwist (v9.5.x) + @serwist/turbopack
  ├─ Route Handler en /serwist/[path] → compila SW en build time
  ├─ Service Worker → precache + runtime caching + push + fallback offline
  └─ SerwistProvider (cliente) → registro + update detection
```

```
┌──────────────────────────────────────────────────┐
│                  Service Worker                    │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Precache │  │ Runtime  │  │ Push +           │ │
│  │ (build)  │  │ Caching  │  │ NotificationClick │ │
│  └──────────┘  └──────────┘  └──────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │           Offline Fallback (/~offline)         │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                    Cliente                         │
│                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Serwist     │  │ Push         │  │ Offline   │ │
│  │ Provider    │  │ Subscription │  │ Mutation  │ │
│  │ (registro   │  │ Provider     │  │ Hook      │ │
│  │  + updates) │  │ (permiso +   │  │ (cola +   │ │
│  │             │  │  toggle UI)  │  │  replay)  │ │
│  └─────────────┘  └──────────────┘  └───────────┘ │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                   Servidor                         │
│                                                    │
│  ┌─────────────┐  ┌────────────────────────────┐ │
│  │ API: push   │  │ notifications.service.ts    │ │
│  │ subscribe/  │  │ (extender con flag sendPush)│ │
│  │ unsubscribe │  └────────────────────────────┘ │
│  └─────────────┘                                  │
└──────────────────────────────────────────────────┘
```

---

## 3. Dependencias a instalar

```bash
# Fase 0
pnpm add serwist esbuild sharp
pnpm add -D @serwist/turbopack

# Fase 2 (push)
pnpm add web-push
pnpm add -D @types/web-push
```

> `serwist` es el sucesor moderno de `next-pwa` y `workbox`, con soporte nativo para Turbopack.

---

## 4. Fases

| Fase | Contenido | Esfuerzo | Depende de |
|------|-----------|----------|------------|
| **0** | PWA instalable + SW base | ~4h | — |
| **1** | Runtime caching inteligente + update lifecycle | ~3.5d | Fase 0 |
| **2** | Push notifications integradas con sistema existente | ~4d | Fase 0 |
| **3** | Offline mutations con cola + replay automático | ~8d | Fase 0 |
| **4** | iOS polish + Web Share + storage management | ~3d | Fase 1, 3 |

> Las fases 1, 2 y 3 son **independientes entre sí** y pueden ejecutarse en paralelo.

---

## FASE 0 — PWA instalable + Service Worker base

**Objetivo:** App instalable en el homescreen con ícono, splash y un SW mínimo que precachea assets y muestra página offline. Sin caching de datos ni push — solo los cimientos.

### Archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `public/icons/pwa-192x192.png` | Crear | Icono PWA 192px |
| `public/icons/pwa-512x512.png` | Crear | Icono PWA 512px |
| `public/icons/pwa-192x192-maskable.png` | Crear | Icono maskable (Android adaptive) |
| `public/icons/pwa-512x512-maskable.png` | Crear | Icono maskable grande |
| `scripts/generate-pwa-icons.mjs` | Crear | Script sharp para regenerar iconos desde un source |
| `src/app/manifest.ts` | Crear | Metadata route de Next.js con `manifest.json` |
| `src/app/serwist/[path]/route.ts` | Crear | Route handler que compila SW con Serwist |
| `src/app/sw.ts` | Crear | Service Worker (precache + offline fallback) |
| `src/app/~offline/page.tsx` | Crear | Página offline con links contextuales |
| `src/components/serwist/serwist-provider.tsx` | Crear | Provider cliente que registra el SW |
| `next.config.ts` | Modificar | Envolver con `withSerwist()` |
| `package.json` | Modificar | Dependencias `serwist`, `@serwist/turbopack`, `esbuild`, `sharp` |
| `src/app/layout.tsx` | Modificar | Agregar `SerwistProvider` + metadata PWA |

### Decisiones de diseño

**¿Por qué SIN `skipWaiting: true` en el SW base?**

El SW no debe tomar control inmediato al instalarse. Si un usuario tiene múltiples tabs abiertas y el SW se activa solo, las tabs con la versión anterior quedan rotas. La actualización del SW se maneja en la Fase 1 con un toast explícito que el usuario acepta.

**Jerarquía de providers en layout.tsx:**

```tsx
<html>
  <body>
    <SerwistProvider>       // Registra SW, escucha updates
      <Providers>           // QueryClient, SessionMonitor
        {children}
      </Providers>
    </SerwistProvider>
  </body>
</html>
```

`SerwistProvider` es la capa más externa del cliente. Registra el SW una sola vez, sin importar qué ruta se visite.

**¿Qué va en el manifest?**

- `name: "Rhinos"`, `short_name: "Rhinos"`
- `display: "standalone"` (sin barra del navegador)
- `theme_color: "#0f172a"`, `background_color: "#ffffff"`
- `orientation: "any"`
- 4 iconos (192, 512, maskable variants)
- `scope: "/"`, `start_url: "/"`

**¿Qué hace `/~offline`?**

Extrae el `orgSlug` del `window.location.pathname`. Si el usuario estaba en `/org/acme/clientes`, muestra una página con links a Clientes, Productos, Precios — las secciones que tendrán datos cacheados (Fase 1). Si no está en una ruta de org, muestra la página genérica. El SW la sirve automáticamente cuando `navigator.onLine === false` y no hay respuesta de red.

### SW mínimo (Fase 0)

```typescript
// src/app/sw.ts
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{
      url: "/~offline",
      matcher: ({ request }) => request.destination === "document",
    }],
  },
});

serwist.addEventListeners();
```

### Verificación

1. `pnpm build` — debe mostrar output de Serwist con precache entries
2. Chrome DevTools → Application → Manifest → verificable e instalable
3. Chrome DevTools → Application → Service Workers → SW registrado
4. Navegar offline → debe mostrar `/~offline` en navegaciones a documentos
5. `pnpm lint` — sin errores
6. Instalar en Android/iOS desde el menú del navegador

---

## FASE 1 — Runtime caching + Update lifecycle

### 1.1 — Caching inteligente con aislamiento por organización

**Objetivo:** Cachear datos de consulta en el SW para que el vendedor vea clientes, productos, precios y catálogo sin conexión. Cada organización tiene su propio espacio de cache físico, evitando mezcla de datos multi-tenant.

**Archivo:** `src/app/sw.ts` — reemplazar `defaultCache` por handlers custom.

### Estrategias por tipo de dato

| Dato | Estrategia | Cache name | TTL | Timeout | ¿Por qué? |
|------|-----------|------------|-----|---------|-----------|
| Clientes | NetworkFirst | `api-{slug}-customers` | 24h | 5s | El vendedor necesita ver su cartera offline |
| Productos/Stock | NetworkFirst | `api-{slug}-products` | 4h | 5s | Stock fluctúa, 4h es balance razonable |
| Precios | NetworkFirst | `api-{slug}-prices` | 2h | 5s | Cambian más seguido, conviene frescura |
| Categorías | NetworkFirst | `api-{slug}-categories` | 24h | 5s | Referencia casi estática |
| Impuestos | NetworkFirst | `api-{slug}-taxes` | 7d | 5s | Cambian muy raramente |
| Transportistas | NetworkFirst | `api-{slug}-carriers` | 7d | 5s | Ídem |
| Productos con precio | NetworkFirst | `api-{slug}-products-price` | 6h | 5s | Usado en dropdowns de venta directa |
| Ventas/Compras/Cobranzas | NetworkOnly | — | — | — | Datos transaccionales, siempre frescos |
| Assets estáticos | CacheFirst | `static` | 30d | — | JS, CSS, imágenes no cambian entre deploys |
| HTML (páginas) | NetworkFirst | `pages` | 1d | 3s | Permite navegación offline entre secciones visitadas |

### Aislamiento por organización

Cada request interceptado por el SW se analiza para extraer el `orgSlug` de la URL:

```
/api/org/acme/clientes    → cache: "api-acme-customers"
/api/org/acme/stock       → cache: "api-acme-products"
/api/org/beta/clientes    → cache: "api-beta-customers"
/api/org/beta/stock       → cache: "api-beta-products"
```

El handler recibe `{ request, url }` y construye el `cacheName` dinámicamente:

```typescript
function getCacheName(url: URL, prefix: string): string {
  const match = url.pathname.match(/\/org\/([^/]+)/);
  const slug = match ? match[1] : "unknown";
  return `api-${slug}-${prefix}`;
}
```

**NetworkFirst** intenta la red primero con un timeout de 5s. Si falla (offline, timeout, error 5xx), sirve del cache. Si no hay entrada en cache, falla. **NetworkOnly** nunca escribe ni lee cache — si no hay red, la request falla, y es intencional.

### 1.2 — SW Update Lifecycle

**Objetivo:** Cuando se despliega una nueva versión, el SW se descarga en background pero no se activa. El usuario ve un toast y decide cuándo actualizar.

**Archivos:**
- `src/components/serwist/serwist-provider.tsx` → agregar detección de `updatefound`
- `src/app/sw.ts` → agregar listeners `message` y `activate`

### Flujo

```
1. Nuevo deploy → build genera SW con hash distinto
2. Browser descarga nuevo SW en background (vía update check cada 24h o al navegar)
3. updatefound → provider detecta que hay nueva versión "waiting"
4. Toast sonner: "Nueva versión disponible" + botón "Actualizar"
5. Usuario clickea → postMessage({ type: "SKIP_WAITING" })
6. SW recibe mensaje → self.skipWaiting()
7. SW activate → self.clients.claim() (toma control de todas las tabs)
8. window.location.reload() → página se recarga con assets nuevos
```

### Verificación

1. `pnpm build` → output de Serwist con cache names custom
2. Navegar a Clientes, Productos, Precios estando online
3. Chrome DevTools → Application → Cache Storage → verificar entradas por org
4. Activar Offline en DevTools → verificar que datos visitados persisten
5. Verificar que ventas/cobranzas/preventas NO están cacheadas
6. Para updates: hacer cambio en sw.ts, rebuild, verificar toast en tab anterior
7. `pnpm lint` — sin errores

---

## FASE 2 — Push Notifications

**Objetivo:** El navegador recibe notificaciones push del sistema aunque la app esté cerrada. Se integra con el sistema de notificaciones in-app existente: un solo punto de entrada decide quién recibe qué, y la push es solo un canal adicional de entrega.

### 2.1 — Arquitectura de integración

El sistema actual ya tiene:
- Tabla `notifications` con RLS
- RPC `notify_users_by_permission()` que inserta notificaciones para todos los usuarios con un permiso dado
- `NotificationBell` en sidebar con polling cada 30s
- Funciones: `get_unread_notifications`, `mark_notification_read`, etc.

Lo que agregamos:
- Tabla `push_subscriptions` para guardar endpoints de push por usuario
- Extensión del RPC `notify_users_by_permission` con flag `p_send_push`
- SW listener para `push` y `notificationclick`
- API route para que el cliente registre/cancele su suscripción
- Componente `PushSubscriptionProvider` + toggle en Configuración

```
Cambio de estado de pedido
  │
  └─► createOrderNotifications()  ← ya existe en notifications.service.ts
        │
        └─► notify_users_by_permission({ ..., p_send_push: true })
              │
              ├─► INSERT INTO notifications  ← in-app bell (igual que antes)
              │
              └─► [NUEVO] Si p_send_push = true:
                    ├─► SELECT push_subscriptions WHERE user_id IN (...)
                    └─► webpush.sendNotification() a cada endpoint
```

**Esto no duplica lógica.** La resolución RBAC sigue en la RPC. El push es un canal de salida adicional, no un sistema independiente.

### 2.2 — Archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/migrations/xxx_push_subscriptions.sql` | Crear | Tabla `push_subscriptions` + índices + RLS |
| `src/types/supabase.ts` | Regenerar | `npx supabase gen types` |
| `src/modules/notifications/types.ts` | Modificar | Agregar tipos `PushSubscription`, `PushNotificationPayload` |
| `src/modules/notifications/service/push.service.ts` | Crear | `sendPushToUsers(userIds, payload)`, `sendPushToAll(orgId, permissionKey, payload)` |
| `src/modules/notifications/service/notifications.service.ts` | Modificar | Agregar `sendPush: true` en `createOrderNotifications()` y similares |
| `src/app/api/org/[orgSlug]/push/subscribe/route.ts` | Crear | POST subscribe, DELETE unsubscribe |
| `src/components/push-subscription-provider.tsx` | Crear | Pide permiso, registra endpoint, expone estado |
| `src/app/org/[orgSlug]/configuracion/notificaciones/page.tsx` | Crear | Toggle activar/desactivar push |
| `src/components/layout/configuration-nav.tsx` | Modificar | Agregar item "Notificaciones" |
| `src/app/sw.ts` | Modificar | `push` event → `self.registration.showNotification()`; `notificationclick` → abrir URL |
| `supabase/migrations/xxx_add_send_push_param.sql` | Crear | Modificar RPC `notify_users_by_permission` para aceptar `p_send_push boolean DEFAULT false` |
| `.env.example` | Modificar | Agregar `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

### 2.3 — Esquema de `push_subscriptions`

```sql
CREATE TABLE push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)  -- un usuario no puede tener el mismo endpoint duplicado
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_org ON push_subscriptions(organization_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);
```

### 2.4 — Flujo de suscripción

```
1. Usuario va a Configuración → Notificaciones
2. Activa el toggle de push
3. PushSubscriptionProvider pide permiso: Notification.requestPermission()
4. Si granted → sw.pushManager.subscribe({ applicationServerKey, userVisibleOnly: true })
5. Obtiene endpoint, p256dh, auth
6. POST /api/org/{orgSlug}/push/subscribe → guarda en push_subscriptions
7. Si denied → muestra mensaje explicando cómo habilitar desde settings del browser
```

### 2.5 — Flujo de envío

```
1. createOrderNotifications() llama a notify_users_by_permission() con sendPush: true
2. RPC inserta en notifications (in-app)
3. Si sendPush: push.service.ts consulta push_subscriptions para los user_ids
4. webpush.sendNotification() con VAPID keys
5. Browser recibe push → SW push event → self.registration.showNotification(title, options)
6. Usuario clickea notificación → SW notificationclick → clients.openWindow(url)
```

### 2.6 — SW push handlers

```typescript
// En src/app/sw.ts
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Rhinos", {
      body: data.body ?? "",
      icon: "/icons/pwa-192x192.png",
      badge: "/icons/pwa-192x192.png",
      data: { url: data.url ?? "/" },
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) {
        existing.focus();
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
```

### 2.7 — Página de configuración de notificaciones

```
/configuracion/notificaciones:
  ┌─────────────────────────────────────┐
  │  Notificaciones Push                │
  │  Recibir notificaciones del sistema │
  │  cuando haya actualizaciones        │
  │                           [toggle]  │
  │                                     │
  │  Estado: ● Conectado                │
  └─────────────────────────────────────┘
```

### Verificación

1. `pnpm build` — sin errores
2. Navegar a Configuración → Notificaciones → activar toggle
3. Chrome DevTools → Application → Service Workers → verificar suscripción push
4. `SELECT * FROM push_subscriptions` — verificar fila creada
5. Disparar `createOrderNotifications()` → verificar notificación del sistema
6. Clic en notificación → navega a la URL correcta
7. Desactivar toggle → verificar DELETE en DB
8. `pnpm lint` — sin errores

---

## FASE 3 — Offline Mutations

**Objetivo:** El vendedor puede crear preventas y clientes sin conexión. Las operaciones se encolan en IndexedDB y se sincronizan al reconectar, sin depender del SW.

### Arquitectura

```
              ┌──────────────────────────────┐
              │    useOfflineMutation()       │
              │                               │
  Usuario ──► │  isOnline?                    │
  crea        │  ├─ SÍ → server action       │
  preventa    │  └─ NO → enqueue a IDB        │
              │          + toast "Guardado"    │
              └──────────────────────────────┘

  ... minutos/horas después, recupera señal ...

              ┌──────────────────────────────┐
              │  useOnlineStatus() → true     │
              │         │                     │
              │  dispara replayQueue()        │
              │    ├─ Lee pendientes IDB      │
              │    ├─ Ejecuta en orden FIFO   │
              │    ├─ Éxito → dequeue         │
              │    └─ Fallo → marcar failed   │
              └──────────────────────────────┘
```

**No usamos Background Sync.** Esa API está deprecada por Chrome y nunca fue implementada en Safari/Firefox. El cliente es dueño de su cola: detecta la reconexión y dispara el replay directamente contra las server actions, sin pasar por el SW.

### Limitación explícita: cliente + preventa encadenados offline

Si el vendedor crea un cliente estando offline, ese cliente no tiene ID real (lo genera Supabase al insertar). Como el formulario de preventa exige un `customerId` válido (el dropdown solo muestra clientes cacheados del servidor), **no se puede crear una preventa para un cliente recién creado offline** hasta que el cliente sincronice.

```
Flujo offline:
  1. Crear cliente → encolado en IDB (sin ID real)
  2. Ir a Preventas → el cliente NO aparece en el dropdown
  3. Opciones del vendedor:
     a. Seleccionar otro cliente existente → preventa normal
     b. Esperar a tener señal para que el cliente sincronice → luego crear preventa
```

Esto es una limitación aceptada para v1. En una iteración futura se puede resolver mediante bundling en la cola (el replay handler crea el cliente y luego la preventa en una sola operación compuesta).

### 3.1 — `useOnlineStatus` hook

**Archivo:** `src/hooks/use-online-status.ts`

Hook que expone `navigator.onLine` de forma reactiva usando `useSyncExternalStore`. Ventajas sobre `useState + useEffect`:

- Siempre refleja el valor actual (sin estado obsoleto)
- SSR-safe (devuelve `true` en servidor para evitar hydration mismatch)
- Sin memory leaks (suscripción limpia al desmontar)

```typescript
"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() { return navigator.onLine; }
function getServerSnapshot() { return true; }

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

### 3.2 — Cola offline en IndexedDB

**Archivos:**
- `src/lib/offline-queue.types.ts`
- `src/lib/offline-queue.ts`

**Sin dependencia `idb`.** IndexedDB vanilla es suficiente para una cola FIFO.

#### Tipos

```typescript
export type QueueOperationType =
  | "create-preventa"
  | "create-cliente";

export type QueueOperationStatus = "pending" | "failed";

export type QueuedOperation = {
  id: string;
  type: QueueOperationType;
  body: unknown;          // payload exacto que espera la server action (sin orgSlug)
  createdAt: string;      // ISO timestamp
  retries: number;
  status: QueueOperationStatus;
  failReason?: string;    // ej: "SESSION_EXPIRED", "NETWORK_ERROR"
};
```

Cada tipo guarda en `body` el payload que corresponde a su server action, sin `orgSlug` (se inyecta en el replay, igual que hacen los hooks `usePreSaleMutation` y `useCustomerMutations`):

| Tipo | `body` | Server Action |
|---|---|---|
| `create-preventa` | `Omit<CreatePreSaleOrderInput, "orgSlug">` | `createPreSaleAction` |
| `create-cliente` | `Omit<CreateCustomerInput, "orgSlug">` | `createCustomerAction` |

#### API de la cola

```typescript
enqueueOperation(op)        // add al store, genera id + createdAt
dequeueOperation(id)        // delete del store
getPendingOperations()      // getAllFromIndex("status", "pending")
getFailedOperations()       // getAllFromIndex("status", "failed")
getPendingCount()           // countFromIndex("status", "pending")
updateOperation(id, patch)  // get + put con merge parcial
```

La conexión a IDB se abre una vez y se cachea en una variable de módulo para no re-abrirla en cada operación.

### 3.3 — `useOfflineMutation` hook

**Archivo:** `src/hooks/use-offline-mutation.ts`

Hook genérico que recibe una server action y decide dónde ejecutarla. El `orgSlug` no se guarda en la cola — se inyecta al momento del replay, igual que hacen los hooks de mutación existentes.

```typescript
const { submitOrEnqueue, isOnline } = useOfflineMutation();

// Uso en el formulario de preventa:
const handleCreate = async (formData: PreSaleFormData) => {
  await submitOrEnqueue(formData, {
    type: "create-preventa",
    onlineAction: () => createPreSaleAction({ orgSlug, ...formData }),
    successMessage: "Preventa creada correctamente",
    offlineMessage: "Guardado. Se sincronizará al reconectar.",
  });
};

// Uso en el formulario de cliente:
const handleCreateClient = async (values: CustomerFormValues) => {
  await submitOrEnqueue(values, {
    type: "create-cliente",
    onlineAction: () => createCustomerAction({ orgSlug, ...values }),
    successMessage: "Cliente creado correctamente",
    offlineMessage: "Guardado. Se sincronizará al reconectar.",
  });
};
```

El hook no conoce de dominios. Recibe un callback `onlineAction` y un `type`. Decide:
- **Online** → ejecuta `onlineAction()` → toast.success(successMessage)
- **Offline** → encola en IDB → toast.success(offlineMessage)

> **Nota:** El `body` que se guarda en IDB es el `formData`/`values` pasado como primer argumento a `submitOrEnqueue`, es decir, el payload sin `orgSlug`. El replay handler inyecta `orgSlug` al llamar a la server action.

### 3.4 — Replay automático al reconectar

**Archivo:** Lógica integrada en `src/components/serwist/serwist-provider.tsx`

Cuando el `SerwistProvider` detecta el cambio de `useOnlineStatus()` a `true`, dispara el replay:

```typescript
async function replayQueue(orgSlug: string) {
  const operations = await getPendingOperations(); // ordenadas por createdAt ASC

  for (const op of operations) {
    try {
      switch (op.type) {
        case "create-cliente": {
          await createCustomerAction({ orgSlug, ...op.body as object });
          break;
        }
        case "create-preventa": {
          await createPreSaleAction({ orgSlug, ...op.body as object });
          break;
        }
      }
      await dequeueOperation(op.id);
    } catch (error) {
      if (isSessionExpired(error)) {
        await updateOperation(op.id, {
          status: "failed",
          failReason: "SESSION_EXPIRED",
        });
        break; // no seguir — el resto también van a fallar por sesión
      }
      const retries = op.retries + 1;
      if (retries >= 3) {
        await updateOperation(op.id, {
          status: "failed",
          failReason: getErrorMessage(error),
        });
      } else {
        await updateOperation(op.id, { retries });
      }
    }
  }

  // Notificar a la UI después del replay
  const failedCount = (await getFailedOperations()).length;
  if (failedCount > 0) {
    navigator.serviceWorker.controller?.postMessage({
      type: "SYNC_COMPLETE",
      failed: failedCount,
    });
  }
}
```

1. Lee todas las operaciones `pending` de IDB
2. Las ejecuta en orden FIFO (la más antigua primero)
3. Por cada operación:
   - Éxito → `dequeueOperation(id)`
   - Error 401 (sesión expirada) → `updateOperation(id, { status: "failed", failReason: "SESSION_EXPIRED" })` → break del loop
   - Otro error → incrementa `retries`. Si `retries >= 3`, marca como `failed`
4. Si hubo `SESSION_EXPIRED`, muestra toast con link a login
5. Emite evento `SYNC_COMPLETE` vía `postMessage` para que la bandeja se refresque

> **No hay API route de replay.** Cada operación se ejecuta desde el cliente contra la misma server action que se usa online (`createCustomerAction`, `createPreSaleAction`). No hay duplicación de lógica de negocio.

### 3.5 — Bandeja de sincronización (UI)

**Archivos:**
- `src/components/sync-queue-status.tsx` → Badge en sidebar
- `src/components/sync-queue-drawer.tsx` → Detalle en Sheet

#### Badge en sidebar

- Se renderiza SOLO cuando `pendingCount > 0 || failedCount > 0`
- Muestra badge ámbar "N pendientes" y/o badge rojo "N fallidas"
- Se refresca cada 10s y al recibir mensaje `SYNC_COMPLETE`
- Click → abre el drawer

#### Drawer de detalle (Sheet)

- Sheet lateral derecho con título "Bandeja de sincronización"
- Sección "Pendientes": lista de operaciones con tipo, fecha, botón eliminar
- Sección "Fallidas": ídem, con `failReason` visible
- Estado vacío: icono check + "No hay operaciones pendientes"

### 3.6 — Manejo de sesión expirada

Si el token de Supabase expiró mientras el usuario estaba offline, las operaciones encoladas fallan con 401 al hacer replay. Estrategia:

1. **Detección:** El replay detecta 401 → marca `failed` con `failReason: "SESSION_EXPIRED"`
2. **UX:** Toast persistente: "Tu sesión expiró. Iniciá sesión para sincronizar N operaciones pendientes." con botón "Iniciar sesión"
3. **Post-login:** Al re-autenticarse, el `useOnlineStatus` sigue en `true` → vuelve a disparar replay automáticamente

### 3.7 — ¿Qué operaciones soportamos offline?

Solo las que **no requieren validación de stock ni afectan datos transaccionales:**

| Operación | ¿Offline? | Server Action | Justificación |
|---|---|---|---|
| Crear preventa | ✅ | `createPreSaleAction` | No valida stock ni descuenta inventario. Estado: DRAFT |
| Crear cliente | ✅ | `createCustomerAction` | No tiene dependencias transaccionales |
| Editar cliente | ❌ | — | El vendedor en campo no edita clientes |
| Confirmar venta | ❌ | — | Requiere validación de stock y genera AR |
| Registrar pago | ❌ | — | Datos financieros, siempre online |
| Crear compra | ❌ | — | Operación transaccional |
| Despachar | ❌ | — | Requiere stock disponible en tiempo real |

**Payloads que se guardan en la cola:**

- `create-cliente` → todos los campos del form: `business_name`, `fantasy_name`, `cuit`, `email`, `phone`, `address`, `city`, `tax_condition`, `customer_channel`, `sales_price_list_id`, `assigned_seller_id`, `due_days`, `province`, `delivery_address`, `delivery_city`, `client_number`, `preferred_carrier_id`
- `create-preventa` → `customerId`, `sellerId`, `saleDate`, `expirationDate`, `creditDays`, `invoiceType`, `observations`, `items[]`, `globalDiscountPercentage`, `globalDiscountAmount`, `taxes[]`

> Ambos payloads corresponden exactamente a `Omit<CreateCustomerInput, "orgSlug">` y `Omit<CreatePreSaleOrderInput, "orgSlug">` respectivamente. El `orgSlug` lo inyecta el replay handler.

### Verificación

| Escenario | Comportamiento esperado |
|---|---|
| Crear preventa online | Se ejecuta `createPreSaleAction`. No toca IDB |
| Crear preventa offline | Se encola. Badge muestra 1 pendiente. Toast "Guardado. Se sincronizará al reconectar" |
| Crear cliente offline | Se encola. Badge muestra 1 pendiente |
| Reconectar después de 3 preventas | Replay automático en orden FIFO. Badge desaparece. Las preventas aparecen en lista al próximo refetch |
| Crear cliente offline → crear preventa para ese cliente | El cliente NO aparece en el dropdown (sin ID real). El vendedor debe esperar a sincronizar el cliente primero |
| Offline + token expirado | Al reconectar, falla con SESSION_EXPIRED. Badge rojo. Toast de sesión con link a login |
| Offline → crear preventa → reconectar → mismo producto fue desactivado | Servidor rechaza: "Producto no está activo". Operación marcada `failed`. Badge rojo en drawer |
| Eliminar operación pendiente manualmente | Se borra de IDB. Nunca se sincroniza. El usuario asume la pérdida |
| Múltiples tabs abiertas | Solo la tab activa hace replay. Otras tabs reciben mensaje SYNC_COMPLETE y refrescan badge |

---

## FASE 4 — iOS & Polish

### 4.1 — Web Share API

Usar `navigator.share()` para compartir presupuestos de forma nativa (WhatsApp, Mail, etc.):

```typescript
// En detalle de presupuesto, botón "Compartir"
if (navigator.share) {
  await navigator.share({
    title: `Presupuesto #${quoteNumber}`,
    text: `Presupuesto de ${customerName} - $${formatCurrency(total)}`,
    url: `${window.location.origin}/org/${orgSlug}/presupuestos/${quoteId}`,
  });
}
```

### 4.2 — Storage management

Monitorear uso de storage y ofrecer limpieza:

- Banner cuando `usage / quota > 80%`: "El almacenamiento offline está casi lleno. Limpiar datos."
- Botón en Configuración → Notificaciones: "Limpiar datos offline" → vacía caches de la org actual
- `navigator.storage.estimate()` para mostrar uso actual

### 4.3 — Badge API

Mostrar contador de operaciones pendientes en el icono de la PWA:

```typescript
const pendingCount = await getPendingCount();
if (pendingCount > 0) {
  await navigator.setAppBadge(pendingCount);
} else {
  await navigator.clearAppBadge();
}
```

### 4.4 — App Shortcuts

En `manifest.ts`, definir accesos rápidos (click derecho / long press en el icono):

```json
{
  "shortcuts": [
    { "name": "Nueva venta directa", "url": "/org/{slug}/venta-directa/nueva", "icons": [...] },
    { "name": "Ver stock", "url": "/org/{slug}/stock", "icons": [...] },
    { "name": "Crear presupuesto", "url": "/org/{slug}/preventa/nueva", "icons": [...] }
  ]
}
```

> Nota: `{slug}` no se resuelve dinámicamente en shortcuts. Requiere que el usuario ya esté en una org o usar `start_url` con parámetros.

---

## 5. Resumen de archivos

| Fase | Crear | Modificar | Total |
|------|-------|-----------|-------|
| 0 — Setup | 10 | 3 | 13 |
| 1 — Caching + Updates | 0 | 2 | 2 |
| 2 — Push | 8 | 5 | 13 |
| 3 — Offline | 6 | 1 | 7 |
| 4 — Polish | 0 | 3 | 3 |
| **Total** | **24** | **14** | **38** |

---

## 6. Estimación total

| Fase | Descripción | Días |
|------|-------------|------|
| 0 | Setup base | 0.5 |
| 1 | Caching + Updates | 3.5 |
| 2 | Push Notifications | 4 |
| 3 | Offline Mutations | 8 |
| 4 | iOS & Polish | 3 |
| Testing | Chrome + Safari iOS + Android + Firefox | 3 |
| **Total** | | **~22 días** |

---

## 7. Dependencias entre fases

```
FASE 0 (setup) ──────────────────────────────────────────────┐
│                                                              │
├──► FASE 1 (caching + updates)                                │
│                                                              │
├──► FASE 2 (push) ─── usa notifications.service.ts existente │
│                                                              │
├──► FASE 3 (offline) ─── usa SW de fase 0                    │
│    │                    usa useOnlineStatus (3.1)            │
│    │                    independiente de fase 1 y 2          │
│    │                                                         │
│    └──► FASE 4 (polish) ── usa SW de fase 0                 │
│                             usa cola de fase 3               │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Rollback por fase

Cada fase puede revertirse independientemente sin afectar a las otras:

### Fase 0
```bash
pnpm remove serwist esbuild sharp
pnpm remove -D @serwist/turbopack
git checkout -- next.config.ts package.json src/app/layout.tsx
rm -rf src/app/manifest.ts src/app/serwist src/app/sw.ts "src/app/~offline" src/components/serwist public/icons/pwa-* scripts/generate-pwa-icons.mjs
pnpm build
```

### Fase 1
```bash
git checkout -- src/app/sw.ts
pnpm build  # regenera SW sin custom handlers
```

### Fase 2
```bash
git checkout -- src/app/sw.ts src/components/push-* src/app/api/org/*/push/ src/modules/notifications/
rm -rf src/app/org/*/configuracion/notificaciones
# DROP TABLE push_subscriptions;
# Revertir migration del RPC
pnpm build
```

### Fase 3
```bash
git checkout -- src/lib/offline-queue* src/hooks/use-offline* src/hooks/use-online* src/components/sync-queue*
pnpm build
# IndexedDB se limpia automáticamente al borrar datos del sitio
```

---

## 9. Desarrollo

```bash
# Build (única forma de testear el SW — no funciona en dev)
pnpm build
pnpm start --experimental-https  # HTTPS necesario para PWA

# Linting
pnpm lint
pnpm lint:fix

# VAPID keys (fase 2)
pnpm exec web-push generate-vapid-keys
```

---

*Plan creado: julio 2026*
