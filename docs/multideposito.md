# Multidepósito: operación, migración y validación

## Modelo y reglas

La ubicación física del stock está en `product_lots.warehouse_id`. Una variante
de catálogo puede tener varios lotes y saldos en distintos depósitos; la relación
vigente es `product_lots.product_variant_id`. El campo histórico
`product_variants.lot_id` se conserva en el esquema por compatibilidad, pero no
debe usarse para resolver disponibilidad ni destino de movimientos nuevos.

La creación de variantes genera un saldo DEFAULT vacío en el depósito principal.
Es inicialización de catálogo, no un ingreso de mercadería. Los ajustes,
recepciones y transferencias posteriores determinan el depósito de cada saldo.

Multidepósito cambia dónde se reserva, ingresa o descuenta stock, conservando los
momentos de cada flujo. La validación y el descuento deben usar el mismo depósito.
No se toma stock de otro depósito automáticamente.

## Operación

### Depósitos y acceso

- En **Configuración → Depósitos** se administran los depósitos, canales
  habilitados y asignaciones de usuarios.
- Propietarios y usuarios con `organization.admin` tienen acceso a todos los
  depósitos. Los demás requieren asignación.
- Los selectores operativos muestran depósitos activos y compatibles con el
  canal. El servidor vuelve a validar el acceso al ejecutar la operación.
- Desactivar un depósito conserva sus saldos e historial. Se permite transferir
  su stock hacia un destino activo para vaciarlo.

### Documentos comerciales

| Flujo | Regla de ubicación |
| --- | --- |
| Presupuesto | Elige depósito mayorista; puede cambiarlo antes de convertirse. No reserva stock por estar en borrador. |
| Pedido y subpedidos | Heredan el depósito del origen y lo mantienen fijo. |
| Venta vinculada | Usa el depósito del pedido. |
| Preventa independiente | Elige depósito; puede cambiarlo mientras esté en `DRAFT`. Al confirmar queda fijo. |
| POS | Elige depósito al abrir caja. Para cambiarlo hay que cerrar la sesión y abrir otra. |
| Compra independiente | Elige un depósito por recepción. |
| Compra vinculada | Cada recepción usa el depósito del pedido. |
| Ajuste e importación | Indican depósito y desambiguan el lote dentro de ese depósito. |

Un reintento de recepción conserva su identidad y depósito; no puede reutilizarse
para otra entrega. Las ejecuciones confiables de preventa por WhatsApp conservan
la resolución del depósito principal.

### Transferencias

Desde el detalle de stock del producto se eligen lote de origen, depósito de
destino y cantidades. Para KG/LT que controlan piezas, se conservan tanto la
cantidad medida como las unidades físicas.

La RPC de transferencia realiza ambas patas en una transacción. La transferencia
no es una compra ni una venta y no cambia el stock total de la organización.
En **Stock → Transferencias** se consulta su historial por depósito.

### Devoluciones y cancelaciones

El reingreso vuelve al lote y depósito del que salió la mercadería. Si el depósito
original está inactivo, se requiere confirmar explícitamente el envío al depósito
principal. La inexistencia del lote original no autoriza un fallback silencioso.

### Reportes

En **Stock → Por depósito** se muestran productos con stock, lotes con stock y
cantidades por depósito, incluyendo depósitos inactivos accesibles al usuario.
El desglose se puede exportar a Excel. El reporte no incluye costos ni valorización.

Las cantidades de la organización se obtienen sumando depósitos; unidades, kg y
litros se mantienen separados. Las columnas de kg/litros usan siempre
`quantity_available`, incluso si el producto no controla piezas. El campo
`unit_quantity_available` representa piezas asociadas: no sustituye la cantidad
medida en los totales de kg/litros. La cantidad de productos por depósito no representa
un conteo único de productos de toda la organización: el mismo producto puede
existir en más de un depósito. Para usuarios con asignaciones limitadas, el
desglose cubre únicamente sus depósitos accesibles.

## Migración y despliegue

Las migraciones se ejecutan manualmente. Este documento no implica que hayan sido
aplicadas a ningún entorno. Antes del cambio, registrar los saldos de referencia
y el conjunto de migraciones ya aplicado en el entorno de destino.

Aplicar únicamente las migraciones pendientes, en orden:

1. `20261029000000_multideposito_foundation.sql`: depósitos, backfill de saldos y movimientos, relaciones e índices.
2. `20261029010000_multideposito_document_snapshots.sql`: depósito en documentos y sesiones.
3. `20261029020000_multideposito_transfers.sql`: transferencias atómicas.
4. `20261029030000_multideposito_initial_assignments.sql`: asignaciones iniciales.
5. `20261029040000_multideposito_wholesale_inheritance.sql`: herencia de depósito mayorista.
6. `20261029050000_multideposito_purchase_receipts.sql`: recepciones por depósito e idempotencia.
7. `20261029060000_multideposito_inventory_adjustments.sql`: ajustes e importaciones por depósito.
8. `20261029070000_multideposito_stock_reentries.sql`: reingresos al origen.
9. `20261029080000_multideposito_warehouse_administration.sql`: administración y asignaciones.
10. `20261029090000_multideposito_warehouse_read_scope.sql`: límites RLS de lectura de depósitos, asignaciones e historial de transferencias.
11. `20261029100000_multideposito_stock_rls_and_reports.sql`: alcance RLS de saldos y movimientos, permisos de historial y ejecución de reportes como usuario invocante.

Después de aplicar SQL, regenerar `src/types/supabase.ts` desde el esquema real y
ejecutar lint, pruebas y build. No editar los tipos generados manualmente. Las
migraciones históricas que referían al lote único no se reescriben; las
implementaciones vigentes deben usar las RPC multidepósito.

Coordinar el despliegue de esquema y aplicación para que los clientes que escriben
stock usen las operaciones por depósito. Verificar también los permisos EXECUTE
de RPC y las políticas RLS con un usuario restringido; los mocks unitarios no
validan estas barreras de PostgreSQL.

### Consultas de comprobación (solo lectura)

Guardar el resultado de esta consulta antes y después de migrar. Comparar por
organización y producto, no solo el total global:

```sql
select organization_id, product_id,
       sum(quantity_available) as quantity,
       sum(unit_quantity_available) as physical_units
from public.product_lots
group by organization_id, product_id
order by organization_id, product_id;
```

Las siguientes consultas deben devolver cero filas después de migrar:

```sql
-- Exactamente un depósito principal por organización.
select o.id
from public.organizations o
left join public.warehouses w
  on w.organization_id = o.id and w.is_default
group by o.id
having count(w.id) <> 1;

-- Cada saldo pertenece a un depósito de la misma organización.
select l.id
from public.product_lots l
left join public.warehouses w
  on w.id = l.warehouse_id and w.organization_id = l.organization_id
where w.id is null;

-- La variante del saldo pertenece al mismo producto y organización.
select l.id
from public.product_lots l
left join public.product_variants v
  on v.id = l.product_variant_id
  and v.product_id = l.product_id
  and v.organization_id = l.organization_id
where l.product_variant_id is not null and v.id is null;

-- Cada movimiento coincide con el depósito de su lote.
select m.id
from public.stock_movements m
left join public.product_lots l
  on l.id = m.lot_id and l.organization_id = m.organization_id
where l.id is null or m.warehouse_id is distinct from l.warehouse_id;
```

## Regresión y QA funcional

Comandos automatizados desde la raíz de la aplicación:

```text
pnpm lint
pnpm exec vitest run
pnpm exec tsc --noEmit --pretty false
pnpm build
git diff --check
```

El error conocido de BigInt/ES2020 en el test de Contabilidad es independiente de
multidepósito. Registrar por separado cualquier error nuevo.

### Estado de verificación (2026-10-30)

- Tipos regenerados: contienen los helpers de alcance y permiso de inventario.
- Lint y build de producción: correctos.
- Suite Vitest: 677 tests pasando y 8 omitidos.
- TypeScript: únicamente el error preexistente de BigInt/ES2020 en Contabilidad.
- El reporte tiene regresión de alcance de consultas por organización/depósitos
  accesibles, lotes y catálogos de más de 1000 registros, depósitos vacíos y
  errores en páginas posteriores. Un fallo no debe producir un total parcial.
- La pantalla distingue errores de consulta de una lista vacía, permite
  reintentar y bloquea exportaciones durante carga/error. Identifica los totales
  como suma de depósitos accesibles, no como conteo único de productos.

Estas pruebas usan mocks de Supabase. La matriz siguiente conserva estado
pendiente hasta ejecutar los flujos con usuarios reales y PostgreSQL; la
regeneración de tipos y el build no certifican la ejecución de RLS ni atomicidad.

### Preparación de los escenarios

Usar un entorno de prueba con dos depósitos activos A/B, uno inactivo C, un
administrador, un usuario asignado solo a A y otro sin asignaciones. Preparar un
producto simple, uno con variantes y productos KG/LT con control de piezas.
Distribuir stock del mismo producto y variante entre A y B. Registrar saldos antes
y después y los IDs de documentos, lotes y movimientos usados como evidencia.

### Escenarios pendientes de ejecutar en base y navegador

| Caso | Resultado esperado |
| --- | --- |
| Crear producto con variantes y agregar combinaciones | Cada variante nueva tiene saldo DEFAULT cero asociado por `product_variant_id`; no requiere `product_variants.lot_id`. |
| Variante con stock en A y B | Total suma ambos; selector por depósito separa saldos; historial por variante incluye los lotes de ambos. |
| Transferencia parcial y total A → B | Total organización constante, dos patas auditables y cantidades KG/LT y piezas conservadas. |
| Transferencia desde C inactivo | Permitida con acceso; no se permite recibir stock en C. |
| Dos transferencias simultáneas que exceden el origen | No dejan saldo negativo ni una única pata confirmada. |
| Stock suficiente en B pero insuficiente en A | Venta, pedido y POS configurados en A rechazan; no descuentan de B. |
| Presupuesto → pedido → venta/subpedido | Todos conservan el depósito seleccionado; cambiarlo después de fijarlo se rechaza. |
| Preventa DRAFT | Cambiar depósito actualiza disponibilidad; confirmar fija el depósito. |
| Revocar asignación con POS abierto | La próxima venta se rechaza en el servidor aunque la pantalla siga abierta. |
| Recepción independiente | Cada recepción ingresa en el depósito elegido. |
| Recepción vinculada a pedido | No puede ingresar en otro depósito. |
| Reintentar recepción | Mismo ID y contenido no duplican stock; cambiar depósito o contenido se rechaza. |
| Importación de lotes homónimos en A y B | Solo cambia el saldo del depósito indicado; identidad ambigua se rechaza. |
| Cancelación, devolución y reversión | Reingresan al origen; repetir operación no duplica stock. |
| Reingreso cuyo origen está inactivo | Exige consentimiento antes de enviar al principal; cancelar no escribe stock. |
| Reporte y exportación | Coinciden con los saldos por depósito, sin duplicar una transferencia como ingreso neto. |
| Usuario restringido y usuario sin asignaciones | No acceden a depósitos ajenos mediante UI, API, RPC ni consultas directas habilitadas por RLS. |

No hay un runner E2E configurado en el proyecto. Esta matriz es el procedimiento
de QA pendiente, no evidencia de ejecución. Concurrencia, atomicidad y políticas
RLS requieren PostgreSQL real; las pruebas unitarias con mocks no los certifican.

## Pendientes para cerrar el rollout

- Ejecutar la matriz funcional y guardar evidencia en el entorno de prueba.
- Revisar las políticas efectivas de acceso a saldos y movimientos por depósito.
- Verificar los reportes SQL existentes y sus agregados de ingresos/egresos para
  asegurar que las transferencias no alteren indicadores netos.
- Resolver el alcance de stock comprometido/reservado por depósito y conteo físico,
  que permanecen como decisiones abiertas del plan.

## Auditoría de permisos y reportes

### Alcance de la migración de lectura

Las políticas iniciales de depósitos, asignaciones y transferencias permitían
lectura a cualquier miembro activo de la organización. La migración
`20261029090000_multideposito_warehouse_read_scope.sql` agrega políticas
**restrictivas** de SELECT: se combinan con las políticas permisivas existentes,
sin ampliar permisos de escritura ni depender de eliminar políticas previas.

- Depósitos: propietarios y administradores ven todos; los demás solo los
  asignados. Se conserva acceso histórico a depósitos inactivos.
- Asignaciones: un usuario consulta las propias; propietarios y administradores
  consultan las de la organización.
- Transferencias: exigen permiso de lectura/gestión de inventario o acceso
  administrativo y acceso a al menos uno de los dos depósitos. El documento
  conserva ambos extremos para que sea auditable desde origen y destino.
- Artículos de transferencia: se ven únicamente si el encabezado de la misma
  organización es visible.

Los helpers de RLS verifican al usuario autenticado, membresía activa y pertenencia
del rol a la organización. No requieren que el depósito esté activo para permitir
la lectura histórica. Las RPC de escritura mantienen sus validaciones operativas.

La migración de lectura inicial no cubre `product_lots`, `stock_movements`, vistas
ni RPC de reportes. Sus definiciones efectivas se relevaron luego manualmente en
el entorno de destino; el endurecimiento correspondiente está en la migración
`20261029100000_multideposito_stock_rls_and_reports.sql`.

### Saldos, movimientos y reportes

La migración `20261029100000_multideposito_stock_rls_and_reports.sql` agrega:

- Políticas restrictivas para SELECT y DML de saldos/movimientos, con membresía
  activa y acceso al depósito mediante `can_access_warehouse`. El estado propuesto
  en INSERT/UPDATE también se valida; un movimiento debe coincidir con el depósito
  y organización del lote.
- Un helper acotado para evaluar permisos de inventario en el historial. Evita
  consultar `role_permissions` bajo el RLS del usuario común, que solo permite
  leer esa tabla a administradores y podía ocultar transferencias autorizadas.
- `security_invoker` en `view_stock_detail`: sus totales respetan el RLS de los
  saldos, conservando las columnas y la fórmula de precios.
- Ejecución invocante para `get_stock_health_alerts` y `get_control_tower_kpis`,
  conservando firmas y JSON. Los datos de las otras tablas comerciales quedan
  sujetos a sus propias políticas. Se fija `search_path` y se retira ejecución
  anónima de esos reportes y de `get_org_activity_metrics`.
- Retiro de privilegios anónimos/públicos sobre saldos, movimientos y la vista;
  se conserva el acceso de los servicios de servidor.

Un administrador sigue viendo todos los depósitos; otros usuarios ven solo los
asignados. Para estos últimos, los indicadores de stock pasan a representar ese
alcance visible. Un producto del catálogo puede tener stock visible cero aunque
exista stock en un depósito no asignado. No se expone ese saldo oculto.

El alcance de filas no reemplaza las validaciones de negocio de las RPC y actions
(módulo, canal, cantidades y destinos activos). Los flujos de venta/POS conservan
su DML autenticado existente, ahora acotado al depósito. Esta migración no convierte
todos los escritores de stock a RPC ni modifica cuándo se descuenta mercadería.

Después de aplicarla, validar con un usuario no administrador asignado solo a A:

1. Lectura directa y detalle de producto no muestran lotes/movimientos de B.
2. INSERT/UPDATE de stock hacia B se rechazan; no cambian los saldos.
3. El historial de transferencias de A funciona con cada permiso admitido, aunque
   ese usuario no pueda leer `role_permissions` directamente.
4. Vista, exportación y alertas reflejan los saldos permitidos de A; administrador
   conserva A+B. Verificar también los permisos de las tablas comerciales usadas
   por el dashboard, ahora ejecutado como invocante.
5. Recepciones/reingresos por servicio y ventas/POS de usuarios autorizados
   continúan funcionando, con los depósitos y momentos de descuento originales.
6. Llamadas anónimas a la vista/reportes se rechazan.

Estas comprobaciones requieren sesiones reales de PostgreSQL/usuarios; ejecutar
la migración desde el SQL Editor como propietario no prueba el RLS del usuario.

### Transferencias en indicadores

La RPC de transferencia registra dos movimientos de tipo `TRANSFER`, con el mismo
`transfer_id`, y saldos anterior/nuevo opuestos. No registra un `INBOUND` o
`OUTBOUND` comercial. El reporte de stock por depósito suma los saldos actuales,
no las cantidades de esas dos filas.

Los indicadores SQL externos deben excluir `TRANSFER` de compras/ventas e
ingresos/egresos comerciales. Si muestran variación física por depósito, usar
`new_stock - previous_stock` para conservar el signo: `quantity` es positiva en
ambas patas. Los reportes de alertas/KPIs relevados suman saldos, no cantidades de
transferencia. El contador de actividad de stock sigue contando ambas patas como
actividad auditable; no representa un ingreso/egreso comercial neto.

Las definiciones efectivas de políticas, vistas y RPC se relevaron manualmente
en el entorno de destino. El diagnóstico temporal y su resultado no forman parte
del repositorio.
