# Maquina de estados de sincronizacion

> **Estado:** implementada; pruebas unitarias disponibles. Integracion DB real y aceptacion mobile pendientes.

## Persistencia local

IndexedDB `rhinos-offline` usa schema version 3 y agrega el store `commands`.

Cada registro contiene:

- El comando V1 validado.
- `draftId` de origen.
- Usuario y organizacion propietarios.
- Estado, intentos y proximo intento.
- Ultimo error comercial o tecnico.
- ID de la preventa creada cuando sincroniza.

El indice unico `byDraft` permite un solo comando por borrador y evita generar distintos `commandId` por toques repetidos.

## Estados

| Estado | Significado |
|---|---|
| `queued` | Espera conectividad, sesion valida o proximo intento |
| `syncing` | Hay un request foreground en curso |
| `requires-review` | Cambio de precio, impuesto o referencia que requiere editar |
| `failed` | Error permanente de permisos o validacion |
| `synced` | El servidor confirmo la preventa y devolvio su ID |

## Replay

El cliente intenta replay:

- Inmediatamente despues de encolar si `navigator.onLine` esta activo.
- Al recibir el evento `online`.
- Al volver la PWA a primer plano.
- Cada 30 segundos mientras la PWA permanece abierta.

`navigator.onLine` no bloquea el replay porque iOS puede mantener esa señal desactualizada despues de recuperar conectividad. El request real a `POST /api/v1/offline-commands` determina si existe conexion.

Cada corrida lista por propietario, no por snapshot u organizacion activa, por lo que procesa comandos de todas sus organizaciones aunque no exista un snapshot activo. Usa timeout HTTP de 15 segundos, lease IndexedDB de 60 segundos, single-flight en memoria y un Web Lock con nombre particionado por propietario. `BroadcastChannel` notifica cambios a otras pantallas o pestanas. La idempotencia del servidor sigue siendo la defensa final cuando esas APIs no estan disponibles.

Una sincronizacion exitosa publica un evento tipado con organizacion, comando y preventa creada. Si el usuario esta en `/org/[orgSlug]/ventas`, la aplicacion invalida las consultas relacionadas y ejecuta `router.refresh()` para volver a renderizar la lista del servidor. El ultimo evento exitoso tambien queda en `localStorage` para refrescar una pagina de Ventas restaurada desde el historial de iOS.

Los errores reintentables usan backoff exponencial con jitter entre el 50% y el 100% de un techo que crece de 5 segundos a 5 minutos. `AUTH_REQUIRED` permanece en cola. Conflictos comerciales no se reintentan automaticamente. La finalizacion verifica el propietario del lease y no modifica un registro que ya esta `synced`, garantizando exito monotono ante respuestas tardias.

## Ciclo del borrador

- El borrador se conserva mientras el comando esta pendiente, fallido o requiere revision.
- Al recibir `ok: true`, se elimina el borrador y se conserva el registro `synced`.
- Abrir un borrador fallido o que requiere revision elimina su comando anterior para permitir editar y generar uno nuevo.
- Eliminar manualmente un borrador elimina tambien su comando local.
- Logout o cambio de cuenta purga snapshots, borradores y comandos del usuario.
- Los registros `synced` se purgan despues de siete dias; comandos no resueltos y sus borradores se conservan.
