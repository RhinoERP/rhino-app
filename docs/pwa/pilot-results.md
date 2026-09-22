# Resultados del piloto PWA

## Estado al 2026-09-22

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

La prueba actual valida el vertical basico, pero no constituye aun la aceptacion completa del piloto.
