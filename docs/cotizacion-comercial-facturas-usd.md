# Cotización comercial en facturas USD

## El problema

En SAFE se reportó que, al facturar en USD, el sistema no permitía indicar el tipo de cambio deseado y este tampoco aparecía en la factura. Se estaban tratando como una sola cosa dos cotizaciones con propósitos distintos:

- **Cotización comercial:** la pactada con el cliente. Se carga en el presupuesto o se corrige en la venta antes de emitir. Es la que debe leer el cliente en el PDF.
- **Cotización fiscal:** la que ARCA exige para autorizar el comprobante USD. La obtiene el flujo de emisión de ARCA y se conserva en la solicitud, el comprobante autorizado y el QR.

El campo anterior `sales_orders.exchange_rate` no era una fuente confiable para reconstruir la cotización comercial: al autorizar una factura también podía quedar allí la cotización fiscal. Usarlo en el PDF podía mostrar al cliente un valor distinto del acordado.

La factura de SAFE **0002-00000006** no tiene una cotización comercial registrada que permita recuperarla con seguridad. Su cotización fiscal de ARCA no debe presentarse como si fuera la comercial.

## Solución implementada

1. Se agregó `sales_orders.commercial_exchange_rate`, opcional y positivo cuando tiene valor. Se expone como `commercialExchangeRate` en la confirmación y actualización de ventas.
2. Al convertir un presupuesto USD en venta, se copia su cotización a este campo. El presupuesto mantiene su campo editable y puede guardarse sin cotización cuando no necesita convertir precios entre monedas.
3. El detalle de la venta USD muestra **“Tipo de cambio comercial USD → ARS”**. Se puede corregir antes de emitir; queda bloqueado mientras la emisión ARCA está pendiente y después de la autorización.
4. Una factura USD no inicia la llamada a ARCA si la venta no tiene una cotización comercial positiva. El error indica que debe cargarse en el detalle de la venta.
5. La emisión fiscal conserva su funcionamiento: ARCA recibe su propia cotización, que se guarda con el comprobante autorizado y se usa en el QR. La cotización comercial se muestra, con ese nombre, en los PDF de ventas y facturas manuales USD.
6. Los comprobantes USD históricos recuperan la cotización comercial únicamente del valor guardado al convertir el presupuesto original. Si ese valor no existe, el PDF regenerado muestra el rótulo comercial con el valor **“no disponible”**. Nunca se toma como reemplazo `sales_orders.exchange_rate`.
7. Los anticipos y saldos documentales USD heredan la cotización comercial de su venta y la validan antes de facturar.

## Verificación realizada

- Pasaron la comprobación de tipos, el linter y **25 tests** relacionados con cotizaciones, PDF, QR y bloqueo de cambios.
- Se generaron y revisaron visualmente ambos tipos de PDF USD: el rótulo y el valor se leen completos.
- Se comprobó que los PDF ARS no muestran el campo comercial.

## Despliegue y caso pendiente

El cambio está implementado en el código, pero **todavía no se aplicó la migración a la base de datos ni se desplegó**. La migración debe ejecutarse antes de publicar la nueva versión.

La venta USD **n.º 23 de SAFE**, cuya emisión ARCA está pendiente de conciliación, queda excluida de la recuperación histórica y bloqueada para cambios y reintentos. Debe conciliarse por separado antes de continuar. Los PDF históricos reflejarán el cambio al volver a generarlos; los archivos ya enviados no se reemplazan automáticamente.
