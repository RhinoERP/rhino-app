# Contrato de comandos offline

## Estado

Contrato V1, persistencia idempotente, RPC transaccional y endpoint implementados. El replay desde IndexedDB se implementa en el siguiente incremento de Fase 3.

## Comando V1

`OfflineCommandV1` es el protocolo durable entre IndexedDB y `POST /api/v1/offline-commands`. No depende de Server Actions ni de identificadores internos de un build de Next.js.

Campos de identidad:

- `commandId`: UUID generado antes de encolar y usado para idempotencia.
- `ownerUserId` y `organizationId`: aserciones que el servidor compara con la sesion y membresia actuales.
- `orgSlugAtCreation`: organizacion seleccionada al crear el comando.
- `snapshotId`: snapshot comercial usado para preparar la preventa.
- `createdAt`: momento en que se creo el comando.

El servidor nunca confia en la identidad enviada por el cliente: deriva usuario y organizacion desde la sesion y vuelve a validar membresia, permisos y referencias.

## `preSale.create`

El payload inicial incluye:

- Cliente y vendedor existentes.
- Fecha de venta.
- Medio de pago e invoice type capturados.
- Observaciones.
- Entre 1 y 500 productos.
- UUID estable por linea.
- Cantidad, precio capturado e impuestos capturados.

El UUID de linea se conserva para relacionar items con snapshots de impuestos dentro de la futura transaccion.

## Validacion

Los schemas usan Zod y rechazan:

- Campos desconocidos.
- IDs que no sean UUID.
- Fechas fuera del formato `YYYY-MM-DD`.
- Numeros no finitos, cantidades no positivas y precios negativos.
- Preventas sin cliente o sin items.
- IDs de linea duplicados.
- Textos y colecciones fuera de limites.

La misma validacion se ejecutara antes de encolar y al recibir el comando en servidor. La validacion de schema no reemplaza la revalidacion de pertenencia, actividad, permisos, precios e impuestos.

## Respuesta

Un resultado exitoso contiene `commandId`, `resourceId` y `duplicate`. Un replay de un comando ya aplicado es exito con `duplicate: true`, no un conflicto.

Los errores estables son:

- `AUTH_REQUIRED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `STALE_REFERENCE`
- `REVIEW_REQUIRED`
- `RETRYABLE`

`REVIEW_REQUIRED` puede incluir diferencias comerciales tipadas con ruta, mensaje, valor capturado y valor actual.

## Persistencia y endpoint

La tabla `offline_sale_commands` impone unicidad `(organization_id, command_id)`. La RPC autenticada `create_offline_pre_sale_atomic` reclama el comando y crea la preventa, sus items y snapshots de impuestos en una sola transaccion.

`POST /api/v1/offline-commands` valida nuevamente el schema, genera un snapshot comercial fresco, compara precios e impuestos y ejecuta la RPC. Un cambio comercial devuelve `409 REVIEW_REQUIRED`; una referencia inactiva o fuera de alcance devuelve `409 STALE_REFERENCE`.

No se registran payloads comerciales completos en logs.

## Cola local y replay

IndexedDB version 3 incorpora el store `commands`. El formulario convierte el borrador en un comando `queued`, intenta replay foreground y muestra su estado en el listado. Los reintentos se ejecutan al recuperar conexion, volver a primer plano y periodicamente mientras la PWA esta abierta.

## Siguiente incremento

Completar la bandeja global de sincronizacion, acciones explicitas de reintento/revision y pruebas de resiliencia contra cortes durante el request.
