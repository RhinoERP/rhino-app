# Checklist de aceptacion en iOS

Usar un iPhone fisico, HTTPS y un build de produccion (`pnpm build && pnpm start`). La PWA debe abrirse desde Home Screen.

## Preparacion

- [ ] Migraciones aplicadas, incluida `20260921120000_harden_offline_pre_sale_replay.sql`.
- [ ] `SUPABASE_SECRET_KEY` disponible solo en servidor.
- [ ] Organizacion con `wholesale` activo, produccion deshabilitada y `seller_offline_snapshot_enabled` activo.
- [ ] Vendedor con `sales.read` y `sales.manage`.
- [ ] Service Worker actualizado despues del ultimo despliegue.

## Snapshot y cold start

- [ ] Descargar clientes, productos, precios, impuestos y configuracion.
- [ ] Confirmar propietario, organizacion, volumen y fecha de expiracion.
- [ ] Cerrar la PWA, activar modo avion y abrirla desde Home Screen.
- [ ] Consultar clientes y productos sin pantalla blanca ni loaders infinitos.

## Borradores

- [ ] Crear dos borradores y alternar entre ambos.
- [ ] Cerrar y reabrir la PWA; confirmar que ambos permanecen.
- [ ] Eliminar un borrador y esperar mas de 600 ms; confirmar que el autosave no lo recrea.
- [ ] Descargar un snapshot nuevo con cambios comerciales y revisar/aceptar la migracion del borrador.
- [ ] Confirmar que referencias ausentes bloquean el envio sin perder el borrador.

## Sincronizacion

- [ ] Encolar una preventa en modo avion.
- [ ] Recuperar conectividad con la PWA abierta y esperar replay automatico.
- [ ] Confirmar transiciones `queued` -> `syncing` -> `synced`.
- [ ] Confirmar una unica venta `DRAFT` con cliente, items, cantidades, precios e impuestos correctos.
- [ ] Confirmar que la fecha de venta coincide con el dia local del iPhone.
- [ ] Confirmar que Ventas se actualiza sin refresh manual.

## Resiliencia

- [ ] Cortar la red durante el request y confirmar retorno a `queued`.
- [ ] Restaurar red y confirmar que el replay recupera la misma venta sin duplicarla.
- [ ] Reintentar manualmente mientras existe un replay automatico.
- [ ] Intentar eliminar durante `syncing`; la operacion debe quedar bloqueada.
- [ ] Suspender y recuperar la PWA; el replay debe continuar al volver a primer plano.
- [ ] Cerrar completamente la PWA; no esperar sincronizacion hasta volver a abrirla.

## Identidad y concurrencia

- [ ] Encolar comandos para dos organizaciones y confirmar replay de ambas.
- [ ] Probar dos contextos abiertos y confirmar una sola venta por comando.
- [ ] Cerrar sesion con cuenta A e iniciar con cuenta B; no deben aparecer datos cruzados.
- [ ] Revocar membresia o permisos antes del replay; el servidor debe rechazarlo.

## Criterio de aprobacion

- [ ] No se pierden borradores ni comandos pendientes.
- [ ] No se crean ventas duplicadas.
- [ ] Un exito confirmado no vuelve a estado pendiente.
- [ ] Los cambios comerciales requieren aceptacion explicita.
- [ ] La fecha civil no cambia por zona horaria.
- [ ] No se exponen datos entre usuarios u organizaciones.
