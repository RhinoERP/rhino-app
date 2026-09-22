# Contrato de comandos offline

## Estado

Contrato V1, persistencia idempotente, endpoint, RPC transaccional, replay foreground y UX de revision/eliminacion implementados. Pendientes las validaciones manuales mobile y las pruebas contra una base Supabase real.

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

El UUID de linea relaciona items con snapshots de impuestos dentro de la transaccion atomica.

## Validacion

Los schemas usan Zod y rechazan:

- Campos desconocidos.
- IDs que no sean UUID.
- Fechas fuera del formato `YYYY-MM-DD`.
- Numeros no finitos, cantidades no positivas y precios negativos.
- Preventas sin cliente o sin items.
- IDs de linea duplicados.
- Textos y colecciones fuera de limites.

La misma validacion se ejecuta antes de encolar y al recibir el comando en servidor. La validacion de schema no reemplaza la revalidacion de pertenencia, actividad, permisos, precios e impuestos.

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

La tabla `offline_sale_commands` impone unicidad `(organization_id, command_id)`. `get_offline_pre_sale_replay_result(jsonb)` es ejecutable por `authenticated`, usa `auth.uid()` y solo devuelve un resultado completado si coinciden actor y hash.

`create_offline_pre_sale_atomic(uuid, jsonb)` reclama el comando y crea la preventa, items y snapshots de impuestos en una transaccion. No es una RPC cliente: la migracion aditiva `20260921120000_harden_offline_pre_sale_replay.sql` revoca las firmas a `public`, `anon` y `authenticated`, y concede la firma nueva solo a `service_role`. El endpoint le entrega el actor que ya verifico mediante sesion y snapshot fresco.

`POST /api/v1/offline-commands` valida el schema. Su servicio autentica mediante el cliente de sesion, consulta primero un replay completado de forma autenticada y, si no existe, genera un snapshot comercial fresco. Ese snapshot vuelve a validar membresia, permisos, alcance e identidad; luego se comparan precios e impuestos antes de invocar la RPC con service role. Un cambio comercial devuelve `409 REVIEW_REQUIRED`; una referencia inactiva o fuera de alcance devuelve `409 STALE_REFERENCE`.

No se registran payloads comerciales completos en logs.

## Cola local y replay

IndexedDB version 3 incorpora el store `commands`. El formulario convierte el borrador en un comando `queued`, intenta replay foreground y muestra su estado. El replay examina todas las organizaciones del propietario y funciona aunque no exista un snapshot activo, con timeout de 15 segundos, leases de 60 segundos, Web Lock por propietario, single-flight en memoria y backoff exponencial con jitter. Un resultado `synced` es monotono y no puede ser sobrescrito por una finalizacion tardia.

Los comandos sincronizados se retienen siete dias; el mantenimiento elimina despues solo ese historial y conserva trabajo no resuelto. La bandeja permite reintentar, revisar/editar y eliminar, con bloqueo de eliminacion durante `syncing`.

## Pendientes

- Ejecutar integracion contra una base Supabase real, incluida respuesta perdida despues del commit.
- Completar aceptacion instalada en Chrome Android y Safari iOS para el flujo de Fase 3.
