# Deudas contra factura

## Configuración

`organization_settings.settings.invoice_backed_debt_enabled` es un booleano,
desactivado por defecto. Se administra en **Configuración → Condiciones de venta →
Generación de deuda de clientes y proveedores**.

La política se aplica por organización, sin condiciones por slug ni dependencia
del módulo de pedidos. El primer uso previsto es `safe-dc`, pero la migración no
activa la opción para ninguna organización.

## Comportamiento

| Operación | Desactivada | Activada |
| --- | --- | --- |
| Despachar una venta fiscal | Comportamiento existente | No crea AR operativa |
| Editar una venta fiscal | Comportamiento existente | No recalcula AR desde la venta operativa |
| Despachar/editar una nota de venta | Comportamiento existente | Conserva la generación/sincronización habitual de AR sin factura |
| Autorizar factura de venta | Comportamiento existente | Asegura una AR por el total y moneda del documento |
| Crear OC, incluso desde pedidos | Respeta el origen elegido | Fuerza `SUPPLIER_INVOICE` |
| Registrar factura vinculada a OC | Conciliación existente | Conciliación existente; la factura determina AP |
| Editar o recibir OC | Comportamiento existente | No recalcula AP desde el importe operativo |
| Factura manual autorizada | Crea AR | Crea AR |

Seleccionar Factura A/B/C no equivale a autorizarla. La autorización ARCA es la
evidencia fiscal para ventas. Las facturas de proveedor deben estar `REGISTERED`.

**Nota de venta:** es una excepción explícita. Conserva su generación habitual
de deuda, el registro de cobros y la sincronización del saldo al editar, aunque
la opción esté activada. No exige autorización fiscal.

Si posteriormente se cambia a un comprobante fiscal y se autoriza, se reutiliza
la AR existente, con sus pagos y créditos, sin crear otra cuenta ni reiniciar sus
saldos. La autorización no concilia automáticamente diferencias de importes de
una cuenta preexistente.

## Anticipos

- Los anticipos fiscales (`ADVANCE`) generan deuda por su propio documento
  autorizado, igual que los documentos fiscales de saldo (`BALANCE`).
- La venta operativa fiscal padre no genera otra deuda por despacharse.
- Se conserva el diferimiento de la AR final del circuito anterior de anticipos:
  `enforce_sales_advance_receivable_deferred` sigue ejecutándose.
- Los anticipos informales de notas de venta conservan su comportamiento
  habitual, incluida la deuda del anticipo y el saldo al despachar.
- No se modifican las reglas de cotización ni conversión monetaria en esta feature.

## Implementación y despliegue

1. Aplicar `supabase/migrations/20261102000000_invoice_backed_debt_policy.sql`.
2. Desplegar la aplicación.
3. Activar la opción en la organización deseada y comprobar los circuitos con
   factura, sin factura, anticipo y saldo.

La base de datos fuerza el origen de las OC y omite las inserciones de AR/AP
provisionales para ventas fiscales y compras. Las notas de venta quedan
exceptuadas tanto en el trigger de inserción como en el RPC de actualización
atómica. Los servicios operativos consultan la misma regla por organización y
tipo de comprobante.

La AR de venta se crea en la misma transacción que persiste la autorización.
Repetir la autorización no duplica la AR ni reinicia sus saldos. Si ya existe
una AR, se conserva: no se concilia automáticamente un registro histórico al
autorizar. Las ediciones operativas, tanto TypeScript como el RPC atómico, no
reescriben su deuda fiscal ni sus ajustes por notas de débito/crédito.

## Históricos

Los saldos iniciales importados (`is_historical = true`) pueden generar deuda
aunque indiquen un comprobante fiscal sin autorización ARCA. Son una excepción
explícita y deben excluirse de la futura limpieza de deudas provisionales.

Activar/desactivar la opción no elimina, oculta ni pone a cero deudas existentes.
Tampoco hace backfill de facturas ya autorizadas. El análisis y la regularización
de datos históricos son una etapa independiente, posterior a esta feature.
Las deudas de notas de venta son válidas y quedan excluidas de la futura limpieza
de deudas provisionales sin respaldo fiscal.

Antes de retirar una deuda habrá que verificar pagos, aplicaciones de crédito,
anticipos y todas sus referencias. No alcanza con comparar total y saldo.

## Verificación manual

- Organización sin opción: una nota de venta despachada y una nota de compra
  siguen generando deuda con el comportamiento existente.
- Organización con opción: crear/despachar una venta fiscal y
  crear/confirmar/recibir OC sin factura no genera deuda, también dentro del
  flujo de pedidos.
- Con la opción activada: despachar nota de venta, cobrar parcialmente y editar
  su total. Debe conservar la misma AR y descontar lo ya cobrado del nuevo total.
- Nota de venta con anticipo informal: probar la creación del anticipo, su cobro
  y el saldo al despachar.
- Cambiar nota de venta a factura y autorizarla: no debe duplicar la AR ni
  reiniciar sus pagos o créditos.
- Autorizar factura de venta antes o después del despacho: una sola AR con
  importe, moneda y vencimiento del documento; repetir no reinicia pagos.
- Registrar factura de proveedor vinculada: AP por el total facturado. Editar
  la OC después no reemplaza ese importe por el total de la OC.
- Anticipos fiscales: probar factura de anticipo, cobro y factura de saldo;
  comprobar el circuito anterior con diferimiento de la cuenta final.
- Deudas históricas: permanecen al activar la opción, incluidos pagos y créditos.

Las reglas SQL se verificaron adicionalmente en PostgreSQL embebido (PGlite)
con un esquema aislado mínimo y los triggers existentes de diferimiento y
conciliación de proveedores. Esa verificación no reemplaza probar la migración
en un entorno Supabase con su esquema completo y RLS.
