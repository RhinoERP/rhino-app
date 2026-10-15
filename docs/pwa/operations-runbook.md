# Runbook operativo PWA offline

## Habilitacion

1. Confirmar migraciones, incluida `20260921120000_harden_offline_pre_sale_replay.sql`.
2. Verificar grants de las RPC segun [`database-migrations.md`](./database-migrations.md).
3. Habilitar PWA en el entorno y `seller_offline_snapshot_enabled` solo en la organizacion piloto.
4. Confirmar `wholesale` activo, produccion deshabilitada y TTL/purga configurados.
5. Preparar datos online y comprobar fecha de expiracion antes de salir sin red.

## Diagnostico

| Sintoma | Revisar |
|---|---|
| Permanece `queued` | Sesion, conectividad real, `nextAttemptAt`, eventos de visibilidad y reapertura |
| Permanece `syncing` | Esperar lease de 60 s; al vencer, el replay puede reclamarlo |
| `requires-review` | Cambios de precio/impuesto o referencia obsoleta; abrir y migrar/editar el borrador |
| `failed` | Permisos o validacion permanente; corregir y generar un comando nuevo |
| Venta creada pero UI desactualizada | Ir a Ventas, volver a visibilidad o recargar; revisar evento particionado con vigencia de 24 h |
| Fecha aparece como el dia anterior en iOS | Confirmar que la lista movil usa `formatDateOnly`; desplegar un build nuevo y actualizar el Service Worker |
| Duplicado sospechado | Buscar por organizacion y `command_id`; no reenviar con un payload distinto |
| Datos offline no se actualizan | Confirmar modo standalone, app visible, conectividad, feature flag, permisos y headers `ETag`/`If-None-Match` |

No solicitar ni registrar payloads comerciales completos. Para soporte usar IDs de comando, organizacion y recurso, codigo de error y timestamps.

## Contencion y rollback

- Deshabilitar el feature flag evita preparar snapshots y nuevas operaciones; no borrar automaticamente trabajo local pendiente.
- No retirar la migracion ni ampliar grants como mitigacion rapida.
- Mantener el endpoint `private, no-store` y el service role exclusivamente en servidor.
- Si se despliega una correccion, reabrir la PWA y aceptar la actualizacion del Service Worker antes de validar.

## Mantenimiento

El cliente purga comandos `synced` despues de siete dias y conserva estados no resueltos. Logout o cambio de cuenta purga snapshots, borradores y comandos del propietario. iOS puede suspender la aplicacion, por lo que mantenimiento y replay se ejecutan al abrir o volver a primer plano, no como garantia en background.

La PWA comprueba el snapshot cada 20 minutos mientras esta visible, y tambien
al abrir, recuperar red o volver a primer plano. Un `304` indica que permisos y
contenido fueron revalidados sin descargar nuevamente el payload. Para detener
nuevas preparaciones automaticas, deshabilitar
`seller_offline_snapshot_enabled`; no borrar trabajo local pendiente como parte
del rollback.
