# Compras · cargar una compra desde la factura en PDF

En **Compras → Nueva compra** hay una tarjeta "Cargar desde la factura (PDF)".

1. El navegador sube el PDF a Storage (`documents/<org>/facturas_importadas/<uuid>.pdf`),
   así no choca con el límite de 1 MB de las server actions. Hasta 10 MB.
2. `importPurchaseInvoiceAction` lo baja, controla que sea un PDF y lo lee con
   IA (`COMMERCIAL_AI_INVOICE_MODEL`, por defecto `claude-sonnet-5-5`) con un
   JSON Schema fijo: emisor, tipo, punto de venta, número, fechas, líneas
   (código, descripción, cantidad, unidad, precio, bonificación, importe),
   descuento general, impuestos y total. No guarda nada todavía.
3. Busca el proveedor por CUIT (o por nombre) y cada línea con su producto:
   primero equivalencias recordadas, después código = SKU, después parecido
   de nombre. Si no hay match seguro deja sugerencias para elegir.
4. El usuario revisa la tabla, elige lo que falte y toca **Pasar a la compra**:
   se completan proveedor, fecha, días de pago (por el vencimiento), ítems con
   cantidades/costos/bonificaciones, descuento general e IVA.
   Cajas → unidades (`units_per_box`), kilos → piezas (`weight_per_unit`).
5. Al guardar la compra, `finishPurchaseInvoiceImportAction` registra la
   factura del proveedor vinculada a la compra con el PDF adjunto (opcional) y
   guarda las equivalencias en `purchase_invoice_product_aliases` para que la
   próxima factura del mismo proveedor se arme sola.

La lectura descuenta créditos de IA Comercial (feature `factura`, ~3–6 créditos
por factura con Sonnet). Si la empresa no tiene créditos, avisa y se carga a mano.

Migración: `supabase/migrations/20261106000000_purchase_invoice_import.sql`.
