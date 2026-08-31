# Contexto de facturación: ventas y compras

Este documento describe el comportamiento **actual** de Rhino. No es una propuesta funcional ni una especificación de cambios.

## Resumen

La facturación fiscal está implementada del lado de **ventas** mediante ARCA. Una orden de venta (`sales_orders`) se confirma operativamente y luego se puede emitir en ARCA; la emisión guarda el número de comprobante, el CAE y su estado fiscal.

En **compras**, el sistema administra la orden de compra, sus importes, impuestos, recepción y deuda con el proveedor. La orden de compra no es una factura fiscal y no existe hoy un flujo equivalente de emisión ni de registración fiscal de comprobantes de proveedor.

```text
VENTAS
Preventa / venta en borrador -> Confirmación -> Emisión ARCA manual
                                      |                 |
                                      |                 +-> comprobante + CAE + estado ARCA
                                      +-> operación / stock

COMPRAS
Orden de compra -> ítems + impuestos + total -> cuenta por pagar (si hay vencimiento)
                                                        -> pagos al proveedor
```

## Venta normal y emisión fiscal

1. La aplicación crea una preventa/orden de venta en `sales_orders` con estado `DRAFT`, sus renglones en `sales_order_items` y los impuestos calculados y congelados en `sales_order_taxes`.
2. Al confirmar, la orden pasa a `CONFIRMED`; el flujo de confirmación actualiza los datos comerciales definitivos y, cuando corresponde, realiza los movimientos de stock. Confirmar la venta **no** emite una factura fiscal automáticamente.
3. Un usuario con permisos de ARCA ejecuta la emisión manual de la venta. Antes de enviar el comprobante se valida, entre otras cosas:
   - que la venta no esté en borrador ni anulada;
   - que tenga cliente, CUIT y condición fiscal compatibles;
   - que tenga ítems e impuestos persistidos;
   - que el tipo de comprobante sea compatible con ARCA y que la organización tenga la configuración/conexión vigente.
4. Durante la emisión, `arca_status` se bloquea en `pending`. Si ARCA autoriza, se guarda `arca_status = authorized`, `invoice_number`, CAE, vencimiento del CAE, punto de venta, número/tipo de comprobante y la solicitud/respuesta. Si falla, queda `arca_status = error` y se conserva el error para poder reintentar.

La orden comercial y su comprobante fiscal comparten la misma fila de `sales_orders` para una venta normal. El número de comprobante manual existente bloquea la emisión ARCA para evitar que se sobreescriba.

### Puntos de código

| Responsabilidad | Ubicación |
| --- | --- |
| Crear preventa/venta en borrador, renglones e impuestos | `src/modules/sales/service/sales.service.ts` — `createPreSaleOrder` |
| Confirmar la venta | `src/modules/sales/service/sales.service.ts` — `confirmSaleOrder` |
| Acción de emisión desde la UI | `src/modules/arca/actions/emit-sale-invoice.action.ts` — `emitSaleInvoiceAction` |
| Validar, enviar a ARCA y persistir la autorización | `src/modules/arca/server/sale-invoicing.service.ts` — `emitSaleInvoice` |

## Anticipos de clientes

Los anticipos se tratan como documentos fiscales separados de la venta operativa. Esto evita reutilizar una factura ya autorizada y permite facturar sólo el importe efectivamente anticipado.

### Creación y emisión del anticipo

1. Se crea un registro en `sales_advances` vinculado a la venta final o a la preventa de origen.
2. El sistema crea otra fila de `sales_orders` de tipo documental `ADVANCE`, sin productos operativos: incluye un único ajuste llamado **Anticipo de producción**.
3. El importe y los impuestos del anticipo se prorratean desde los importes e impuestos fiscales de la venta original; se guarda también el `fiscal_snapshot`.
4. Al emitir el anticipo, el documento `ADVANCE` se envía a ARCA mediante el mismo servicio de facturación de ventas. Cuando queda autorizado, se crea/vincula una cuenta por cobrar en `accounts_receivable` y el anticipo pasa a `INVOICED`.
5. Al cobrarse por completo esa cuenta, el flujo de cobranzas actualiza el anticipo a `PAID`.

Los documentos `ADVANCE` y `BALANCE` son exclusivamente fiscales: la base de datos impide que contengan productos, que se despachen, se entreguen o generen remitos.

### Liquidación de anticipo para venta estándar

Para un anticipo originado en una venta normal (`origin_type = SALE`), el camino es:

1. El anticipo debe estar completamente cobrado.
2. Se emite la factura ARCA de la venta final y se genera su cuenta por cobrar.
3. Se crea y emite una nota de crédito por el importe del anticipo, referenciando la factura de anticipo.
4. La nota de crédito crea un crédito del cliente (`customer_credits`).
5. Ese crédito se aplica a la cuenta por cobrar final. El saldo restante de la venta queda pendiente para cobrar; si no queda saldo, el anticipo termina liquidado.

Estados principales: `DRAFT` -> `ISSUE_SUBMITTED` -> `INVOICED` -> `PAID` -> `CLOSING` -> `FINAL_INVOICED` -> `CREDIT_NOTE_SUBMITTED` -> `CREDIT_AVAILABLE` -> `SETTLED`. Ante una emisión incierta o un error recuperable se usan `RECONCILIATION_REQUIRED` o `FAILED_RECOVERABLE`.

### Anticipos de preventa y factura de saldo

Para un anticipo originado en una preventa (`origin_type = PREVENTA`), no se usa una nota de crédito para liquidarlo:

1. Cada anticipo se factura como documento `ADVANCE` separado y se cobra normalmente.
2. Una vez que la preventa fue convertida y confirmada, todos los anticipos aplicables deben estar facturados/cobrados o aplicados; no puede haber anticipos pendientes o en conciliación.
3. El sistema crea un documento fiscal independiente `BALANCE`, asociado a la preventa mediante `parent_sales_order_id`, por el total menos los anticipos aplicables. Sus impuestos también se prorratean.
4. Se emite el documento `BALANCE` ante ARCA, se crea su cuenta por cobrar y se registran las aplicaciones en `sales_advance_applications`. Los anticipos pasan a `APPLIED`.

La preventa operativa conserva su valor comercial completo; el documento de saldo existe sólo para facturación fiscal.

### Puntos de código

| Responsabilidad | Ubicación |
| --- | --- |
| Tipos, estados e inputs de anticipos | `src/modules/sales-advances/types.ts` |
| Crear documento `ADVANCE`, prorratear impuestos y reservar la relación | `src/modules/sales-advances/service/sales-advances.service.ts` — `createSalesAdvance` |
| Emitir factura de anticipo y crear cuenta por cobrar | `src/modules/sales-advances/service/sales-advances.service.ts` — `issueSalesAdvance` |
| Liquidar un anticipo de venta estándar con NC y crédito | `src/modules/sales-advances/service/sales-advances.service.ts` — `settleSalesAdvance` |
| Emitir el saldo fiscal de una preventa | `src/modules/sales-advances/service/sales-advances.service.ts` — `issuePreventaBalanceInvoice` |
| Cambiar el anticipo a cobrado al registrar cobranzas | `src/modules/collections/actions/register-payment.action.ts` |
| Restricciones e integridad de `ADVANCE`/`BALANCE` | `supabase/migrations/20260818000000_preventa_advances_without_stock.sql` |

## Compras y cuentas por pagar

El flujo de compra actual es administrativo/operativo:

1. Se crea una orden en `purchase_orders` con proveedor, fechas, renglones, descuentos, impuestos y total. Su estado inicial es `ORDERED`.
2. Los renglones se guardan en `purchase_order_items` y los impuestos en `purchase_order_taxes`.
3. Si la orden tiene `expiration_date`, el sistema crea o actualiza la cuenta por pagar correspondiente en `accounts_payable`, por el total de la orden y con ese vencimiento. Sin vencimiento no se crea automáticamente una cuenta por pagar.
4. La orden puede avanzar operativamente por `ORDERED`, `IN_TRANSIT`, `RECEIVED` o `CANCELLED`; la recepción administra mercadería/stock, no la facturación fiscal del proveedor.
5. Los pagos se registran contra `accounts_payable` en `payable_payments`, disminuyendo el saldo pendiente y actualizando su estado (`PENDING`, `PARTIAL` o `PAID`).

La interfaz permite adjuntar un PDF de factura externa del proveedor, pero se adjunta a un **pago** (`payable_payments.invoice_pdf_url` e `invoice_filename`), no a la orden de compra ni a una entidad de factura de proveedor.

### Puntos de código

| Responsabilidad | Ubicación |
| --- | --- |
| Crear orden, ítems, impuestos y cuenta por pagar opcional | `src/modules/purchases/service/purchases.service.ts` — `createPurchaseOrder` / `syncAccountsPayable` |
| Acción de creación de compra | `src/modules/purchases/actions/create-purchase.action.ts` — `createPurchaseAction` |
| Cambiar estado operativo de la compra | `src/modules/purchases/service/purchases.service.ts` — `updatePurchaseOrderStatus` |
| Registrar pagos de cuentas por pagar | `src/modules/collections/actions/register-payment.action.ts` |
| Adjuntar PDF externo de factura del proveedor a un pago | `src/modules/collections/actions/upload-payment-invoice.action.ts` — `uploadPaymentInvoiceAction` |

## Entidades e interfaces relevantes

| Área | Entidades / interfaz | Uso actual |
| --- | --- | --- |
| Venta | `sales_orders`, `sales_order_items`, `sales_order_taxes` | Documento comercial, renglones e impuestos fiscales de la venta. |
| Factura de venta | `emitSaleInvoice`, `arca_status` | Emite manualmente en ARCA y persiste comprobante, CAE y resultado. |
| Cobranza | `accounts_receivable`, `receivable_payments` | Cuenta y pagos a cobrar de ventas, anticipos y saldos. |
| Anticipos | `sales_advances`, `ADVANCE`, `BALANCE`, `sales_advance_applications` | Relación entre anticipo, documentos fiscales y aplicación al saldo. |
| Crédito | `customer_credits`, notas de crédito | Crédito generado al liquidar anticipos de venta estándar. |
| Compra | `purchase_orders`, `purchase_order_items`, `purchase_order_taxes` | Orden administrativa de compra, sus ítems e impuestos. |
| Pago a proveedor | `accounts_payable`, `payable_payments` | Deuda con el proveedor, pagos y adjunto opcional de su factura PDF. |

## Límites actuales importantes

- Una orden de compra no es un comprobante fiscal y el sistema no emite documentos a ARCA por compras.
- No hay una entidad ni un flujo de alta/validación/contabilización de factura fiscal de proveedor asociado a `purchase_orders`.
- El PDF de una factura de proveedor es sólo un adjunto de respaldo del pago: no sustituye una registración de factura de compra.
- La emisión ARCA de ventas es una acción explícita; confirmar una venta no la factura automáticamente.
- Los anticipos sólo admiten Factura A, B o C y requieren que ARCA y los datos fiscales involucrados estén correctamente configurados.
