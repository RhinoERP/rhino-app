## Plan: Tesorería y Cheques

Implementar Tesorería como un módulo operativo dentro de `services/accounting`, con saldos bancarios paralelos a la contabilidad y generación de asientos formales directos. El frontend se integra como nuevo módulo `/org/[orgSlug]/tesoreria`, con carga de movimientos bancarios, boletas de depósito, carteras de cheques recibidos/emitidos y conexión con Cobranzas para registrar cheques propios cuando se paga a proveedores con cheque.

**Steps**

### Fase 1: Modelo de datos y backend contable-operativo
1. Auditar las tablas existentes relacionadas a bancos/cheques en el esquema actual (`bank_accounts`, `issued_checks` mencionadas en tipos Supabase) para decidir migración controlada, pero el módulo nuevo debe exponer su API desde `services/accounting` y persistir el ledger operativo de Tesorería en el esquema `accounting`.
2. Crear migración nueva en `services/accounting/migrations/013_create_treasury_module.sql` con tablas operativas:
   - `accounting.treasury_bank_accounts`: cuenta bancaria operativa por organización con los siguientes campos: `id` (UUID PK), `org_id`, `nombre` (nombre descriptivo, ej. "Banco BBVA Cuenta Corriente"), `banco` (nombre del banco), `numero_cuenta` (CBU / alias / número de cuenta, opcional pero recomendado), `alias` (alias CBU, opcional), `moneda` (ARS | USD), `saldo_operativo` NUMERIC(15,4) default 0, `activa` bool default true, `cuenta_contable_id` FK obligatorio a `accounting.chart_of_accounts`, `descripcion` (notas opcionales), `creado_at`, `actualizado_at`. La cuenta contable seleccionada debe ser de tipo ACTIVO y tener `permite_movimientos = true`. Constraint UNIQUE en `(org_id, nombre)` para evitar duplicados por organización.
   - `accounting.treasury_movements`: ledger bancario operativo con tipo de movimiento, fecha, descripción obligatoria, importe, signo débito/crédito, cuenta bancaria, referencia a asiento contable, referencia externa y estado.
   - `accounting.received_checks`: cartera de cheques recibidos cargados manualmente desde Tesorería, con datos del cheque, cliente/tercero opcional, banco emisor, fechas, importe, estado (`EN_CARTERA`, `DEPOSITADO`, `RECHAZADO`, `ANULADO`) y referencias a boleta/asiento.
   - `accounting.issued_checks`: cartera de cheques propios emitidos desde pagos a proveedores, con cuenta bancaria propia, número, proveedor, fecha emisión, fecha débito/vencimiento, importe, estado (`EMITIDO`, `DEBITADO`, `RECHAZADO`, `ANULADO`) y referencia al pago de Cobranzas.
   - `accounting.treasury_deposit_slips`: cabecera para boletas de depósito de cheques y efectivo, con banco destino, fecha, total, descripción, asiento y estado.
   - `accounting.treasury_deposit_slip_checks`: relación entre boleta de depósito de cheques y cheques recibidos.
3. Actualizar `services/accounting/src/db/types.ts` con tipos Kysely para las tablas nuevas, manteniendo importes como string NUMERIC(15,4), siguiendo la convención del servicio contable.
4. Crear `services/accounting/src/modules/treasury/` con servicios y queries:
   - `treasury.service.ts`: operaciones transaccionales de movimientos, boletas, cheques y saldo operativo.
   - `treasury.queries.ts`: listados, filtros, detalle de cuenta bancaria, cartera recibida, cartera emitida.
   - `treasury.types.ts`: enums y DTOs internos.
5. Crear `services/accounting/src/routes/tesoreria.routes.ts` y registrar el router en `services/accounting/src/routes/index.ts` bajo `/tesoreria`.
6. Definir endpoints backend mínimos:
   - `GET /tesoreria/cuentas-bancarias?org_id=` — listar todas (activas e inactivas) con saldo operativo y datos de cuenta contable vinculada.
   - `GET /tesoreria/cuentas-bancarias/:id?org_id=` — detalle de una cuenta bancaria con cuenta contable resuelta.
   - `POST /tesoreria/cuentas-bancarias` — crear cuenta bancaria; valida que `cuenta_contable_id` sea ACTIVO + `permite_movimientos`; rechaza con 422 si ya existe nombre en la org.
   - `PUT /tesoreria/cuentas-bancarias/:id` — actualizar `nombre`, `banco`, `numero_cuenta`, `alias`, `moneda`, `cuenta_contable_id`, `descripcion`; no permite modificar `saldo_operativo` directamente (sólo por movimientos).
   - `PATCH /tesoreria/cuentas-bancarias/:id/estado` — activar o desactivar (`{ activa: boolean }`); no permite desactivar si tiene movimientos pendientes (cheques en cartera o boletas abiertas).
   - **Plan de cuentas (completar CRUD en `services/accounting/src/routes/cuentas.routes.ts`)** — el servicio contable ya expone `GET /cuentas`, `POST /cuentas` y `PUT /cuentas/:id`. Agregar los endpoints faltantes:
     - `GET /cuentas/:id?org_id=` — detalle de una cuenta con jerarquía (padre resuelto).
     - `PATCH /cuentas/:id/estado` — activar/desactivar (`{ activa: boolean }`); no permitir desactivar si tiene asientos activos o es cuenta padre de cuentas activas.
     - `GET /cuentas/arbol?org_id=` — lista jerárquica (padre → hijos) para renderizar el árbol en el UI; útil para el selector de cuenta en formularios.
   - `GET /tesoreria/movimientos?org_id=&cuenta_id=&desde=&hasta=&tipo=`
   - `POST /tesoreria/movimientos-bancarios`
   - `POST /tesoreria/boletas/deposito-cheques`
   - `POST /tesoreria/boletas/deposito-efectivo`
   - `GET /tesoreria/cheques/recibidos?org_id=&estado=`
   - `POST /tesoreria/cheques/recibidos`
   - `PUT /tesoreria/cheques/recibidos/:id/rechazar`
   - `GET /tesoreria/cheques/emitidos?org_id=&estado=`
   - `POST /tesoreria/cheques/emitidos`
   - `PUT /tesoreria/cheques/emitidos/:id/debitar`
   - `PUT /tesoreria/cheques/emitidos/:id/rechazar`
7. Implementar las operaciones de Tesorería de forma transaccional: primero validar estado y saldos, luego crear asiento formal, luego crear movimiento operativo, luego actualizar saldo y estado de cheque/boleta. Si falla cualquier parte, no debe quedar saldo operativo desalineado.

### Fase 2: Asientos contables automáticos y manuales
8. Agregar tipos de evento contable en `services/accounting/src/schemas/eventos.schema.ts` para Tesorería:
   - `MOVIMIENTO_BANCARIO_DEBITO`
   - `MOVIMIENTO_BANCARIO_CREDITO`
   - `CHEQUE_RECIBIDO_RECHAZADO`
   - `CHEQUE_PROPIO_RECHAZADO`
   - `DEPOSITO_CHEQUES`
   - `DEPOSITO_EFECTIVO`
   - `DEBITO_CHEQUE_PROPIO`
9. Agregar migración de reglas contables iniciales para esos eventos:
   - Cheque rechazado de cliente: DEBE cuenta seleccionada, HABER banco.
   - Cheque rechazado propio: DEBE banco, HABER cuenta seleccionada.
   - Débito bancario: DEBE cuenta seleccionada, HABER banco.
   - Crédito bancario: DEBE banco, HABER cuenta seleccionada.
   - Boleta de depósito de cheques: DEBE banco, HABER `VALORES_A_DEPOSITAR`.
   - Boleta de depósito de efectivo: DEBE banco, HABER caja seleccionada.
   - Débito de cheque propio: DEBE `VALORES_A_PAGAR`, HABER banco.
10. Para los casos “manuales”, permitir que el frontend envíe la cuenta seleccionada como `lineasAsignadas` o campo equivalente, reutilizando el patrón de líneas seleccionables del motor de reglas.
11. Reutilizar `resolveEvent()` y `callCreateJournalEntry()` para que los movimientos creen asientos formales directos y guarden `journal_entry_id` en las tablas operativas.
12. Agregar cuentas semánticas faltantes al plan de cuentas si no existen: `VALORES_A_DEPOSITAR`, `VALORES_A_PAGAR`, `CHEQUES_RECHAZADOS`, y las cajas/bancos necesarios por organización. Estas cuentas pueden agregarse vía migración SQL como seed inicial o desde el UI de gestión del plan de cuentas descrito en la Fase 2b. En ambos casos los `account_code` deben estar definidos antes de ejecutar la Fase 1 de Tesorería en producción.

### Fase 2b: CRUD de Plan de Cuentas en el módulo Contabilidad
12a. Completar los wrappers en `src/lib/accounting-client.ts` y `src/lib/accounting-server.ts` para los endpoints nuevos de plan de cuentas:
   - `fetchCuenta(id, orgId)` — detalle de una cuenta.
   - `fetchCuentasArbol(orgId)` — árbol jerárquico para selectores.
   - `createCuenta(input)` — crear cuenta con validación de `account_code` único y padre coherente.
   - `updateCuenta(id, input)` — actualizar todos los campos editables: `codigo`, `nombre`, `tipo`, `naturaleza`, `permite_movimientos`, `activa`, `padre_id`, `moneda`.
   - `toggleCuentaEstado(id, activa)` — activar/desactivar.
12b. Crear `src/modules/accounting/actions/chart-of-accounts.action.ts` con server actions: `createAccountAction`, `updateAccountAction`, `toggleAccountEstadoAction`, protegidas por permiso `accounting.manage`.
12c. Agregar queries en `src/modules/accounting/queries/queries.client.ts`: `useCuentasArbol(orgId)` con staleTime adecuado para selectores; `useCuenta(id, orgId)` para detalle.
12d. Crear página `src/app/org/[orgSlug]/contabilidad/plan-de-cuentas/page.tsx` — lista del plan de cuentas con vista de árbol jerárquico (expandible por tipo: ACTIVO, PASIVO, PN, INGRESO, EGRESO) y botones de acción por fila.
12e. Crear componentes en `src/components/accounting/`:
   - `chart-of-accounts-tree.tsx`: árbol expandible por tipo con columnas `código`, `nombre`, `tipo`, `naturaleza`, `moneda`, `activa`, `permite_movimientos` y acciones (editar, activar/desactivar).
   - `account-form-dialog.tsx`: formulario para crear y editar una cuenta contable con los campos: `codigo` (ej. "1.1.05"), `nombre`, `account_code` (código semántico único, ej. `VALORES_A_DEPOSITAR`), `tipo` (ACTIVO | PASIVO | PN | INGRESO | EGRESO), `naturaleza` (DEUDORA | ACREEDORA), `permite_movimientos` bool, `activa` bool, `padre_id` (selector de cuenta padre filtrado por tipo compatible), `moneda` (ARS | USD | AMBAS). Debe validar que `account_code` no esté ya usado en la org y que el padre tenga `permite_movimientos = false` (las cuentas de movimiento son hojas).
   - Reusar `account-form-dialog.tsx` como selector en el formulario de cuentas bancarias de Tesorería para elegir la cuenta contable vinculada.
12f. Agregar ítem de navegación en `src/components/layout/app-sidebar.tsx` bajo la sección Contabilidad: "Plan de Cuentas" → `/org/[orgSlug]/contabilidad/plan-de-cuentas`, con permiso `accounting.manage` o `accounting.read`.

### Fase 3: Cliente Next.js y acciones de integración
13. Extender `src/lib/accounting-client.ts` y `src/lib/accounting-server.ts` con wrappers tipados para endpoints de Tesorería: cuentas bancarias, movimientos, boletas, cheques recibidos y cheques emitidos.
14. Crear `src/modules/treasury/types.ts`, `src/modules/treasury/queries/queries.client.ts`, `src/modules/treasury/queries/query-keys.ts` y `src/modules/treasury/actions/*.action.ts` siguiendo el patrón de accounting/collections.
15. Las acciones server del frontend deben validar permisos de organización, llamar al servicio contable por proxy/server client y revalidar `/org/${orgSlug}/tesoreria`.

### Fase 4: Integración con Cobranzas y cheques propios
16. Extender el input de pago a proveedores en `src/modules/collections/actions/register-payment.action.ts` para aceptar datos estructurados de cheque cuando `payment_method` sea `cheque` o `e-cheq`: cuenta bancaria propia, número, fecha emisión, fecha débito/vencimiento, importe y observaciones.
17. Actualizar `src/components/collections/register-payment-dialog.tsx` para que, al ejecutar un pago pendiente a proveedor con cheque/e-cheq, solicite los datos del cheque y la cuenta bancaria propia.
18. Actualizar `src/components/collections/bulk-payment-dialog.tsx` con el mismo comportamiento para pagos masivos a proveedores con cheque/e-cheq.
19. Después de registrar el pago en Cobranzas, crear en Tesorería un `issued_check` en estado `EMITIDO`. En esta etapa no se descuenta el saldo bancario todavía; el saldo baja recién cuando el cheque se marca como `DEBITADO` desde la cartera.
20. Al marcar un cheque propio como debitado desde Tesorería, crear el asiento `DEBITO_CHEQUE_PROPIO`, crear movimiento bancario HABER y actualizar saldo operativo de la cuenta bancaria.
21. Al marcar un cheque propio como rechazado, crear asiento `CHEQUE_PROPIO_RECHAZADO`, crear movimiento bancario DEBE y mantener trazabilidad al cheque/pago original.

### Fase 5: Frontend de Tesorería
22. Registrar el nuevo módulo en navegación en `src/components/layout/app-sidebar.tsx`, bajo un permiso nuevo como `treasury.read` / `treasury.manage` o ligado inicialmente al módulo `accounting` si se quiere evitar migración de permisos en la primera entrega.
23. Crear ruta principal `src/app/org/[orgSlug]/tesoreria/page.tsx` con resumen de saldos bancarios, accesos a movimientos y carteras.
24. Crear componentes en `src/components/treasury/`:
   - `bank-accounts-summary.tsx`: tarjetas con saldo operativo por cuenta bancaria activa.
   - `bank-account-form-dialog.tsx`: formulario para crear y editar una cuenta bancaria; incluye selector de cuenta contable filtrado por tipo ACTIVO + `permite_movimientos`; campos: nombre, banco, número de cuenta/CBU, alias, moneda, descripción y cuenta contable vinculada.
   - `bank-account-list.tsx`: tabla de cuentas bancarias de la org con acciones de editar, activar/desactivar.
   - `bank-movements-table.tsx` y `bank-movement-columns.tsx`: historial de movimientos.
   - `bank-movement-dialog.tsx`: carga de débitos/créditos bancarios y rechazos.
   - `check-deposit-slip-dialog.tsx`: boleta de depósito de cheques recibidos.
   - `cash-deposit-slip-dialog.tsx`: boleta de depósito de efectivo.
   - `own-check-debit-dialog.tsx`: marcar cheques propios como debitados.
   - `check-portfolio-manager.tsx`: modal gestor de carteras recibida/emitida.
25. El gestor de carteras debe permitir alternar entre:
   - Cartera de cheques recibidos: cargar manualmente, ver pendientes, seleccionar para depósito, rechazar, anular.
   - Cartera de cheques emitidos: ver emitidos pendientes, marcar debitado, marcar rechazado, anular si todavía no fue debitado.
26. La boleta de depósito de cheques debe seleccionar banco destino y cheques recibidos en estado `EN_CARTERA`; al confirmar, crea asiento, movimiento bancario DEBE, actualiza saldo y marca cheques como `DEPOSITADO`.
27. La boleta de depósito de efectivo debe seleccionar banco destino, caja origen, importe y descripción; al confirmar, crea asiento, movimiento bancario DEBE y actualiza saldo.
28. Movimientos bancarios manuales deben exigir descripción, cuenta bancaria, fecha, importe, tipo y cuenta contable contrapartida cuando corresponda.

### Fase 6: Permisos, reportes y robustez
29. Agregar permisos/módulo si el sistema requiere granularidad: `treasury.read`, `treasury.manage`, `treasury.checks.manage`, y migración/seed de permisos para roles existentes.
30. Agregar filtros por fecha, cuenta bancaria, tipo, estado de cheque y búsqueda por descripción/número de cheque.
31. Asegurar idempotencia en operaciones críticas usando claves derivadas de cheque/boleta/movimiento para evitar asientos duplicados.
32. Agregar validaciones de estado: no depositar cheque ya depositado, no debitar cheque ya debitado, no rechazar cheque anulado, no crear cheque propio duplicado por cuenta+número+org.

**Relevant files**
- `services/accounting/migrations/013_create_treasury_module.sql` — nueva estructura de Tesorería, carteras y tabla de cuentas bancarias con todos los campos del CRUD.
- `services/accounting/src/modules/treasury/treasury.queries.ts` — queries para CRUD de cuentas bancarias: listado por org, detalle, crear, actualizar, activar/desactivar con validación de movimientos pendientes.
- `services/accounting/src/db/types.ts` — tipos Kysely para tablas nuevas, incluyendo `TreasuryBankAccountsTable` con todos sus campos y enums de moneda.
- `services/accounting/src/routes/cuentas.routes.ts` — agregar endpoints faltantes: `GET /cuentas/:id`, `PATCH /cuentas/:id/estado`, `GET /cuentas/arbol`.
- `services/accounting/src/modules/accounts/accounts.queries.ts` — extender con `getCuentaById`, `getCuentasArbol`, `toggleCuentaEstado` con guard de asientos activos.
- `src/modules/accounting/actions/chart-of-accounts.action.ts` — server actions para crear, editar y toggle de cuentas contables.
- `src/modules/accounting/queries/queries.client.ts` — agregar `useCuentasArbol` y `useCuenta`.
- `src/components/accounting/chart-of-accounts-tree.tsx` — árbol expandible del plan de cuentas con acciones.
- `src/components/accounting/account-form-dialog.tsx` — formulario create/edit de cuenta contable, reutilizable en Tesorería como selector.
- `src/app/org/[orgSlug]/contabilidad/plan-de-cuentas/page.tsx` — página de gestión del plan de cuentas.
- `services/accounting/src/routes/index.ts` — registrar router `/tesoreria`.
- `services/accounting/src/routes/tesoreria.routes.ts` — endpoints REST del módulo.
- `services/accounting/src/modules/treasury/treasury.service.ts` — lógica transaccional de saldos, cheques, boletas y asientos.
- `services/accounting/src/modules/treasury/treasury.queries.ts` — listados y detalle.
- `services/accounting/src/schemas/eventos.schema.ts` — eventos contables nuevos.
- `services/accounting/src/modules/chart/rules.engine.ts` — reutilizar resolución de reglas y líneas seleccionables.
- `services/accounting/src/modules/journal/journal.service.ts` — reutilizar `callCreateJournalEntry()`.
- `src/lib/accounting-client.ts` — wrappers fetch para UI por proxy.
- `src/lib/accounting-server.ts` — wrappers server-to-service para acciones.
- `src/modules/collections/actions/register-payment.action.ts` — integración de pagos a proveedores con cheque propio.
- `src/components/collections/register-payment-dialog.tsx` — datos estructurados de cheque para pago individual.
- `src/components/collections/bulk-payment-dialog.tsx` — datos estructurados de cheque para pago masivo.
- `src/app/org/[orgSlug]/tesoreria/page.tsx` — pantalla principal nueva.
- `src/components/treasury/` — componentes del módulo y gestor de carteras.
- `src/components/layout/app-sidebar.tsx` — navegación.

**Verification**
1. Ejecutar migraciones del servicio contable en base local y verificar creación de tablas, FKs, índices y constraints.
2. Ejecutar typecheck del servicio contable: `pnpm --filter accounting typecheck` si existe script; si no, `cd services/accounting && npx tsc --noEmit -p tsconfig.json`.
3. Ejecutar typecheck del frontend con la ruta confiable del repo: `node .\\node_modules\\typescript\\bin\\tsc --noEmit -p tsconfig.json`.
4. Probar backend con casos API:
   - Crear cuenta bancaria operativa vinculada a cuenta contable.
   - Crear débito bancario y verificar asiento + saldo menor.
   - Crear crédito bancario y verificar asiento + saldo mayor.
   - Cargar cheque recibido manual, depositarlo por boleta y verificar estado + saldo + asiento.
   - Rechazar cheque recibido depositado y verificar movimiento inverso.
   - Registrar pago a proveedor con cheque desde Cobranzas y verificar cheque propio en cartera sin afectar saldo bancario.
   - Marcar cheque propio debitado y verificar saldo menor + asiento.
   - Marcar cheque propio rechazado y verificar saldo mayor + asiento.
5. Probar UI manualmente en `/org/[orgSlug]/contabilidad/plan-de-cuentas`: crear cuenta nueva, editar, desactivar, verificar validación de `account_code` duplicado, verificar que no se puede desactivar cuenta con asientos activos, verificar árbol jerárquico expandible.
5b. Probar que el selector de cuenta contable en el formulario de cuenta bancaria de Tesorería muestra correctamente solo cuentas tipo ACTIVO + `permite_movimientos`.
6. Probar UI manualmente en `/org/[orgSlug]/tesoreria`: filtros, modales, errores de validación, estados vacíos y permisos.
6. Ejecutar `npx ultracite check` o `npx ultracite fix` al cierre si el entorno lo permite.

**Decisions**
- El backend de Tesorería vive dentro de `services/accounting` para simplificar despliegue y reutilizar motor de reglas/asientos.
- Las cuentas bancarias son entidades operativas propias vinculadas a cuentas contables del plan.
- Los cheques recibidos se cargan manualmente desde Tesorería, no automáticamente desde Cobranzas en esta primera definición.
- Los cheques propios sí se crean automáticamente desde pagos a proveedores con método cheque/e-cheq en Cobranzas.
- Los asientos de Tesorería se crean formales directos por defecto.
- El saldo bancario operativo se mantiene en paralelo a los asientos contables y se actualiza sólo por operaciones de Tesorería confirmadas.

**Out of Scope**
- Conciliación bancaria automática con extractos importados.
- Importación masiva de cheques o movimientos desde Excel/banco.
- Flujo de aprobación de Tesorería previo a asiento formal.
- Cheques de terceros recibidos automáticamente desde cobros a clientes.
- Multi-sucursal/caja avanzada más allá de seleccionar caja contable en depósito de efectivo.

**Further Considerations**
1. Si más adelante quieren conciliación bancaria, conviene agregar `external_bank_statement_lines` y relacionarlas contra `treasury_movements` sin cambiar el diseño base.
2. Si la contabilidad necesita revisión previa, se puede cambiar por configuración a asientos informales reutilizando `createInformalEntry()`.
3. Si `public.issued_checks` ya está en uso real, la implementación debe migrar esos datos o crear una vista/compatibilidad antes de reemplazar el flujo.