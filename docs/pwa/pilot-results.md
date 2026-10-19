# Resultados del piloto PWA

## Estado al 2026-09-22

> Este registro describe la prueba inicial; las tareas pendientes se mantienen
> historicas. El estado del refresco automatico implementado despues se resume
> en la seccion de actualizacion del 2026-10-01.

Entorno piloto:

- organizacion: LuchoBet (`luchobet`);
- cliente: PWA instalada desde Safari en iPhone mediante HTTPS;
- backend: Supabase con migracion `20260921120000_harden_offline_pre_sale_replay.sql` aplicada.

## Resultados confirmados

- La organizacion permite descargar el snapshot al habilitar `seller_offline_snapshot_enabled`.
- La PWA instalada puede crear y conservar una preventa offline.
- Al recuperar conectividad, la preventa se sincroniza sin errores visibles.
- El servidor crea la venta resultante en estado `DRAFT`.
- No se observaron duplicados durante la prueba basica.
- El flujo de Ventas refleja la operacion sincronizada.

## Incidentes encontrados

### Feature flag de snapshot

La descarga fue rechazada mientras `seller_offline_snapshot_enabled` estaba deshabilitado para LuchoBet. La configuracion se habilito y la descarga volvio a funcionar. No fue una regresion del endpoint.

### Fecha desplazada en la lista movil

La lista movil construia un `Date` desde un valor `YYYY-MM-DD`. Safari lo interpretaba como UTC y podia mostrar el dia anterior en Argentina. Se reemplazo esa conversion por `formatDateOnly`, que trata el valor como fecha civil sin zona horaria.

Estado: corregido en codigo; pendiente de confirmar en iPhone despues de desplegar el build actualizado y renovar el Service Worker.

## Pendientes antes de ampliar el piloto

- Confirmar la fecha corregida en la PWA actualizada.
- Interrumpir la red durante una sincronizacion y verificar reconciliacion sin duplicados.
- Probar dos contextos concurrentes para el mismo propietario.
- Revocar membresia o permisos antes del replay.
- Ejecutar logout de cuenta A y login de cuenta B sin datos cruzados.
- Forzar un cambio de precio o impuesto y completar `requires-review`.
- Completar aceptacion en Chrome Android.
- Medir tiempos de descarga, tasa de sincronizacion y errores durante un periodo sostenido.

La prueba inicial valida el vertical basico, pero no constituye la aceptacion completa del piloto.

## Actualizacion del 2026-10-01

- Se confirmo en codigo que el flujo no contiene un slug hardcodeado: la
  organizacion se resuelve a partir de la ruta actual y se valida contra la
  membresia y permisos de la sesion.
- Se implemento la preparacion automatica del snapshot al abrir la PWA
  instalada y su comprobacion condicional mediante ETag cada 20 minutos en
  foreground.
- Esta nueva ruta de actualizacion fue cubierta con tests automatizados y build
  de produccion, pero aun no tiene aceptacion manual en Safari iOS/Chrome
  Android.
- La habilitacion continua siendo gradual por organizacion mediante
  `seller_offline_snapshot_enabled`; no se considera aprobado un rollout
  general hasta completar los casos pendientes de `test-matrix.md`.
- Ante 401/403/404/422 de autorizacion/elegibilidad, el cliente ahora purga
  snapshot, borradores y comandos de la organizacion afectada; falta validar
  este caso en dispositivos.
