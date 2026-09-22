# Refresh de Ventas despues de sincronizar

## Objetivo

Hacer visible una preventa sincronizada aunque Ventas estuviera montada, se navegue hacia ella despues, iOS restaure una pagina desde BFCache o el exito ocurra en otra pestana.

## Mecanismo

Al completar un comando, se publica `offline-pre-sale-synced` por `BroadcastChannel` y se persiste el ultimo evento en `localStorage`. La clave incluye `ownerUserId` y `organizationId`; el payload incluye tambien `orgSlug`, `commandId`, `resourceId` y `syncedAt`.

`OfflineSalesRefresh` revisa el evento:

- al montar y al cambiar de ruta;
- al volver el documento a visible;
- en `pageshow` cuando la pagina viene de BFCache;
- al recibir `BroadcastChannel`;
- al recibir el evento `storage` de otra pestana.

Solo procesa eventos de la misma cuenta, organizacion y slug, con fecha no futura y antiguedad maxima de 24 horas. Invalida las queries de ventas y preventas; si la ruta actual es exactamente la lista de Ventas de esa organizacion, ejecuta `router.refresh()` una vez por comando.

`BroadcastChannel` cubre clientes activos y `localStorage` aporta durabilidad corta. Si storage no esta disponible, el canal sigue funcionando; si el canal no existe, montaje, visibilidad, BFCache y `storage` mantienen la recuperacion disponible.
