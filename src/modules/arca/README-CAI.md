# Remitos R con CAI

Rhino obtiene autorizaciones mediante AFIP SDK y asigna la numeración al confirmar un despacho documentado. Safe usa el recorrido de Pedidos / Despacho para generar el documento completo. La conexión es independiente de WSFE: se envían el CUIT del emisor y el CUIT de login; la propiedad `password` se omite por completo para utilizar la credencial guardada en el proyecto del proveedor.

## Puesta en marcha

1. Aplicar `supabase/migrations/20261123000000_remittance_cai.sql` después de las migraciones existentes de remitos y despacho.
2. Mantener `AFIP_SDK_ACCESS_TOKEN` del proyecto que contiene la credencial. La recepción digital utiliza la clave `ARCA_SECRETS_MASTER_KEY` ya usada por la integración ARCA.
3. En el panel de AFIP SDK, guardar el CUIT de login y su clave fiscal en Configuración → Credenciales de ARCA. Guardar la credencial no prueba el acceso: se comprueba en la operación.
4. En Rhino, entrar a Configuración → Comprobantes → Remitos con CAI. Completar CUIT de acceso, punto de venta específico de remitos, modalidad y datos fiscales del emisor. El CUIT representado se toma de la organización.
5. Validar en ARCA y luego solicitar el CAI, o cargar uno existente. La validación no genera una autorización. Los trámites son reales; la integración no interpreta el ambiente de homologación de WSFE como un entorno de prueba para automatizaciones.
6. Contrastar CAI, fecha y numeración con la constancia. Para emitir el documento completo, confirmar la habilitación de la empresa como autoimpresor. Activar la autorización y habilitar la emisión con CAI.

La solicitud utiliza el contrato público `cai-request`: comprobante 91, punto de venta, cantidad, `resguardo: false` y `validateOnly`. No se inventan parámetros de autoimpresor ni rangos que el proveedor no devuelve. La aceptación del trámite para la modalidad de Safe debe verificarse con su CUIT y punto de venta; hasta entonces puede incorporarse una autorización obtenida en ARCA. Si la constancia no fija un número final para autoimpresor, ese límite queda vacío. Los formularios de imprenta requieren rango y datos del impresor.

## Emisión y recepción

- En Despacho, usar Preparar remitos y despachar. El diálogo muestra el CAI y divide el detalle en documentos de hasta 26 líneas.
- La transacción existente guarda documentos, detalle y despacho. Un trigger valida el CAI y asigna `PPPPP-NNNNNNNN` bajo bloqueo por organización. El contador fiscal es independiente del prefijo y contador históricos.
- Los datos fiscales se incorporan a la copia histórica del documento en el servidor. Los números no se reservan durante la preparación. Un rollback tampoco consume numeración.
- Si interviene un transporte de terceros, completar su nombre, CUIT y domicilio en la preparación. Estos datos quedan en el documento histórico.
- El PDF incluye letra R, código 091, CAI y vencimiento, datos del emisor, original y duplicado. Su generación y almacenamiento pueden reintentarse usando el mismo documento.
- En los documentos del despacho, Compartir recepción permite copiar un enlace para enviar junto al PDF. El destinatario confirma nombre y recepción sin cuenta. El enlace contiene una capacidad criptográfica; la base guarda solamente su hash. No se envían mensajes automáticamente.
- La confirmación de recepción es idempotente y se rechaza si el documento fue anulado. Se muestra su estado en los documentos del despacho.
- Control mensual exporta los remitos utilizados en el período como TSV, con punto de venta, número, CAI y estado. No presenta una declaración en ARCA.

## Renovación y errores

- Una autorización nueva queda pendiente de activación. Activarla reemplaza la autorización anterior del mismo emisor y punto de venta, sin alterar los remitos ya emitidos.
- Incorporar el último número utilizado fuera de Rhino al activar. La base impide retroceder frente a los documentos y autorizaciones ya registrados.
- Cada trámite tiene una identidad durable, parámetros sin secretos e identificador del proveedor. El navegador consulta una operación pendiente cada cinco segundos mientras la pantalla está abierta; también puede consultarse manualmente al volver.
- Un timeout no provoca otra solicitud. Si no puede recuperarse el resultado, un administrador concilia el intento con evidencia de ARCA o del proveedor. Los intentos todavía en curso requieren esperar o consultar antes de conciliarlos.
- La anulación de un CAI requiere comprobar primero que ARCA lo permite y confirmar la acción irreversible. Se bloquea la emisión mientras su anulación está pendiente. No equivale a anular un remito individual.
- La gestión requiere administración de la organización. La emisión conserva los permisos y el alcance del despacho. Las tablas nuevas no conceden acceso directo a `anon` ni a `authenticated`; las escrituras pasan por acciones autenticadas y RPC reservadas al servidor.

## Verificación local

```sh
pnpm exec vitest run src/modules/arca
bash scripts/test-cai-db.sh
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

El script de base de datos usa un contenedor PostgreSQL descartable y no modifica Supabase remoto. Verifica el ciclo de autorización, numeración concurrente, rollback, vencimiento, agotamiento, inmutabilidad, intentos duplicados, protección del acceso y recepción idempotente.

La interfaz bloquea las solicitudes mientras haya datos fiscales sin guardar. Las validaciones se limitan al CUIT, punto de venta, tipo de comprobante y cantidad verificados; vencen a la hora para solicitar y a los quince minutos para anular. Una operación incierta puede conciliarse con evidencia; los intentos en curso requieren esperar al menos diez minutos. Los errores de confirmación se muestran dentro del diálogo y conservan los datos para reintentar.

La revisión de frontend incluyó componentes reales con acciones simuladas en Chrome: anchos de 320 a 1440 píxeles, modo oscuro, navegación por teclado, carga fallida, rechazo de solicitud/importación/activación/anulación/conciliación, reintento de despacho con la misma identidad, recepción y copia manual del enlace. Estas pruebas no emiten CAI ni reemplazan la validación de acceso de Safe en ARCA.

## Contratos del proveedor

- [Solicitar CAI](https://afipsdk.com/docs/automations/cai-request/)
- [Credenciales guardadas](https://afipsdk.com/docs/automations/credentials/)
- [Anular CAI](https://afipsdk.com/docs/automations/cai-cancel/)
- [Aceptar delegación de servicio](https://afipsdk.com/docs/automations/accept-service-delegation/)

La delegación de WSFE no se considera prueba de acceso al servicio de autorización de impresión. La aplicación no envía certificados ni claves privadas a estas automatizaciones.
