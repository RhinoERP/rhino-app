# Runbook operativo PWA offline

## Habilitacion

1. Confirmar migraciones, incluida `20260921120000_harden_offline_pre_sale_replay.sql`.
2. Verificar grants de las RPC segun [`database-migrations.md`](./database-migrations.md).
3. Habilitar `seller_offline_snapshot_enabled` inicialmente solo en la organizacion piloto; ampliar en forma gradual tras la aceptacion.
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
| La organizacion no puede preparar snapshot | Confirmar modulo `wholesale`, produccion deshabilitada, usuario miembro activo con permiso de ventas y flag de offline habilitado en ajustes de preventa |
| No aparece tutorial de instalacion | Verificar navegador soportado (Safari iOS o Chrome Android/iOS), viewport mobile, permiso de ventas, modulo wholesale y que no esté instalada/descartada por siete días |

No solicitar ni registrar payloads comerciales completos. Para soporte usar IDs de comando, organizacion y recurso, codigo de error y timestamps.

## Contencion y rollback

- Deshabilitar el feature flag bloquea nuevos snapshots y comandos en servidor. No purga snapshots ya descargados del dispositivo; la purga por revocacion debe tratarse como pendiente.
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

Las rutas `/~offline/*` tambien revalidan el snapshot al abrir, recuperar red,
volver a primer plano y cada 20 minutos. Si el servidor confirma que el acceso
fue revocado, muestran una pantalla de bloqueo y el evento limpia vistas offline
abiertas en otras pestañas.

Al recibir un 401, 403, 404 o 422 del endpoint de snapshot, el cliente elimina
snapshot, borradores y comandos locales del usuario para esa organizacion; los
datos de las otras organizaciones quedan intactos. Sin conectividad no puede
enterarse de la revocacion y aplica el vencimiento local como limite residual.

El endpoint es multi-organizacion y no depende de `luchobet`. Habilitar una
organizacion requiere que participe del MVP (ventas mayoristas, sin produccion),
tener el feature flag activo y completar la aceptacion local de sus datos,
permisos, tamano del snapshot y flujo de sincronizacion. El flag por si solo no
constituye aprobacion para un rollout general.
