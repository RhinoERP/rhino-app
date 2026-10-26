# Matriz de pruebas PWA

## Cobertura automatizada existente

| Area | Cobertura |
|---|---|
| Contratos | Schemas de snapshot, draft, comando y registro |
| IndexedDB | Particion, leases, retencion de siete dias y conservacion de pendientes |
| Migracion de draft | Snapshot nuevo, precios, impuestos y referencias faltantes |
| Replay | Exito, retry, single-flight, Web Lock por propietario y timeout de 15 s |
| Endpoint/servicio | Validacion, errores tipados, replay y llamada atomica |
| Snapshot condicional | ETag estable, respuesta `304`, renovacion de expiracion y refresco automatico |
| Revocacion local | Purga transaccional por usuario/organizacion al recibir 401/403/404/422 |
| Guia de instalacion | Deteccion Safari iOS, Chrome iOS, Chrome Android e ignorar otros navegadores móviles |
| Eventos | `BroadcastChannel`, fallback de storage y particion |
| Ventas | Mount, navegacion, visibilidad, BFCache, canal, storage y filtro de 24 h |

## Integracion manual pendiente

| Caso | Estado |
|---|---|
| Migracion `20260921120000` aplicada y replay basico en Supabase real | Confirmados en entorno piloto |
| Grants directos de ambas RPC | Pendiente de prueba explicita |
| Commit exitoso con respuesta perdida, sin duplicado | Pendiente |
| Rollback atomico por error de item/impuesto | Pendiente |
| Revocacion de membresia o permiso antes del replay | Pendiente |
| Revocacion de permiso/flag con PWA abierta, bloqueo y purga local en dispositivo real | Pendiente de aceptacion manual |
| Tutorial visible y correcto desde Safari iOS y Chrome Android | Pendiente de aceptacion manual |
| ETag `304` en navegador real y renovacion de expiracion local | Pendiente |
| Dos pestanas/ventanas con el mismo propietario | Pendiente en navegador real |
| Cuenta A logout, cuenta B login, sin datos cruzados | Pendiente en dispositivos |
| Snapshot reemplazado y migracion/revision del draft | Pendiente en dispositivos |
| Storage lleno o eliminado por el sistema | Pendiente |

## Aceptacion de dispositivos

| Plataforma | Shell | Flujo snapshot/draft/sync |
|---|---|---|
| Safari iOS 16.4+ Home Screen | Validado | Snapshot y sincronizacion basica validados; matriz completa pendiente |
| Chrome Android instalado | Pendiente | Pendiente |
| Chrome/Edge desktop | Desarrollo y tests unitarios | Aceptacion manual pendiente |
| Firefox | Background Sync no requerido | Aceptacion manual pendiente |

La migracion, descarga de snapshot y sincronizacion basica fueron ejecutadas con base real desde iOS. La descarga inicial y actualizacion ETag automatica se implementaron despues y todavia requieren aceptacion manual. No se afirma que rollback, concurrencia, cortes de red ni la aceptacion mobile completa hayan sido validados.
