# Fase 3 - Implementacion de comandos y sincronizacion

> **Estado:** implementacion tecnica completa; integracion con Supabase real y aceptacion mobile pendientes.

## Flujo implementado

1. El formulario valida el borrador y crea un unico comando V1 por `draftId` en IndexedDB.
2. El replay foreground lista todos los comandos del propietario, sin limitarse a la organizacion del snapshot activo.
3. `POST /api/v1/offline-commands` valida el JSON y delega al servicio de comandos.
4. El servicio consulta el resultado completado con la sesion autenticada. Si no existe, crea un snapshot fresco y valida usuario, organizacion, permisos, referencias, precios e impuestos.
5. Solo despues de esas verificaciones, el servidor usa service role para llamar `create_offline_pre_sale_atomic(uuid,jsonb)` con el actor verificado.
6. La RPC reclama la idempotencia y crea orden, items e impuestos en una transaccion.

## Replay y durabilidad

- Disparadores: enqueue, montaje, evento `online`, retorno a visibilidad y cada 30 segundos.
- Timeout por request: 15 segundos.
- Lease IndexedDB: 60 segundos, recuperable al vencer.
- Coordinacion: single-flight y Web Lock por propietario; idempotencia de base como defensa final.
- Retry: backoff exponencial con jitter, hasta cinco minutos.
- Exito monotono: una finalizacion tardia no sobrescribe `synced`.
- Retencion: comandos sincronizados durante siete dias; trabajo no resuelto se conserva.

## UX

La bandeja muestra `queued`, `syncing`, `requires-review`, `failed` y `synced`. Permite reintentar, revisar/editar y eliminar con confirmacion; no permite eliminar durante `syncing`. Editar un conflicto elimina el comando local anterior y conserva el borrador para crear uno nuevo. Un exito elimina el borrador.

## Referencias

- [`offline-command-contract.md`](./offline-command-contract.md)
- [`sync-state-machine.md`](./sync-state-machine.md)
- [`database-migrations.md`](./database-migrations.md)
- [`offline-sales-refresh.md`](./offline-sales-refresh.md)
