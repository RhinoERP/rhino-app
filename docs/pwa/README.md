# PWA de Rhinos

Esta carpeta centraliza decisiones, investigacion, implementacion y resultados del proyecto PWA orientado a vendedores.

## Documento principal

- [Plan PWA v2](./plan-pwa-v2.md): arquitectura vigente, alcance, estado, seguridad y rollout.
- [Plan original](./plan-pwa.md): antecedente historico y obsoleto. No debe utilizarse como guia de implementacion.

## Decision vigente

Rhinos comenzara con una PWA enfocada en vendedores. La aplicacion usa un shell PWA seguro, snapshots explicitos en IndexedDB y una Command API idempotente/transaccional. No se cachean HTML, RSC ni APIs autenticadas de forma generica.

Expo/React Native queda condicionado a resultados del piloto. El backend offline y los contratos deben permanecer neutrales al cliente para permitir esa evolucion sin rehacer la logica critica.

## Alcance inicial

- Service Worker global y promocion de instalacion solo para usuarios con `sales.manage` o `sales.manage.all` y modulo `wholesale`.
- Preventas offline para organizaciones sin produccion.
- Clientes existentes incluidos en el snapshot.
- Sincronizacion foreground.
- Revalidacion comercial en servidor.
- Diferencias visibles como `requires-review`.
- Alta de clientes offline, presupuestos de produccion y push diferidos.

## Documentos tecnicos

| Documento | Proposito |
|---|---|
| [`phase-0-implementation.md`](./phase-0-implementation.md) | Cambios realizados, configuracion y decisiones tecnicas del shell PWA |
| [`offline-snapshot-contract.md`](./offline-snapshot-contract.md) | Contrato, volumen medido, versionado y vigencia del snapshot |
| [`phase-2-local-drafts.md`](./phase-2-local-drafts.md) | Borrador local de preventa, autosave, recuperacion y limites |
| [`offline-command-contract.md`](./offline-command-contract.md) | Comandos, respuestas, idempotencia y errores tipados |
| [`sync-state-machine.md`](./sync-state-machine.md) | Estados, reintentos, locks y reconciliacion |
| [`phase-3-command-sync-implementation.md`](./phase-3-command-sync-implementation.md) | Implementacion actual de Command API, replay y UX |
| [`offline-sales-refresh.md`](./offline-sales-refresh.md) | Actualizacion durable de Ventas despues de sincronizar |
| [`database-migrations.md`](./database-migrations.md) | Migraciones y permisos de las RPC offline |
| [`security-threat-model.md`](./security-threat-model.md) | Riesgos de almacenamiento, identidad, replay y revocacion |
| [`test-matrix.md`](./test-matrix.md) | Cobertura automatizada y validaciones manuales pendientes |
| [`ios-acceptance-checklist.md`](./ios-acceptance-checklist.md) | Checklist reproducible para aceptar el flujo instalado en iPhone |
| [`operations-runbook.md`](./operations-runbook.md) | Habilitacion, diagnostico, rollback y soporte |
| [`pilot-results.md`](./pilot-results.md) | Resultados, incidentes y pendientes del piloto |

Los documentos se crean cuando exista informacion real. No deben anticiparse con contenido especulativo.

## Bitacora de decisiones

| Fecha | Decision | Estado |
|---|---|---|
| 2026-09-11 | PWA primero; Expo condicionado a metricas del piloto | Aprobada |
| 2026-09-11 | Service Worker global; promocion solo para vendedores habilitados | Aprobada |
| 2026-09-11 | Fase 0 no cachea datos autenticados | Aprobada |
| 2026-09-11 | MVP inicial: preventa sin produccion y sin alta offline de clientes | Aprobada |
| 2026-09-11 | Replay mediante Command API, no Server Actions persistidas | Aprobada |
| 2026-09-11 | Sentry con proyecto propio y source maps privados | Aprobada |
| 2026-09-14 | Fase 0 validada manualmente en Safari iOS instalado en Home Screen | Aprobada |
| 2026-09-14 | Snapshot: clientes asignados y sin vendedor; productos con variantes excluidos | Aprobada |
| 2026-09-14 | Snapshot con vigencia inicial de 12 horas y purga tras 72 horas de inactividad | Provisional para piloto |
| 2026-09-14 | Snapshots habilitados mediante feature flag por organizacion | Aprobada |
| 2026-09-21 | RPC atomica restringida a service role; actor verificado por servidor | Aprobada |
| 2026-09-21 | Replay foreground multi-organizacion y refresh durable de Ventas | Implementada |
| 2026-09-22 | Migracion de hardening aplicada y sincronizacion de preventa validada en iOS | Validada para piloto |

## Regla de mantenimiento

- Actualizar primero `plan-pwa-v2.md` cuando cambie alcance o arquitectura.
- Agregar aqui el enlace al documento tecnico nuevo.
- Registrar decisiones irreversibles o costosas en la bitacora.
- Mantener el plan original solo como referencia historica.
