# Accounting Service

Servicio Express de contabilidad para RHINO.

El servicio se puede ejecutar de dos formas:

- Local o servidor persistente: `src/server.ts` levanta Express con `app.listen`.
- Vercel serverless: `api/index.ts` adapta la misma app Express a una Function.

## Desarrollo local

```bash
pnpm install
pnpm --filter @rhinos/accounting-service dev
```

El modo local usa `services/accounting/.env` y escucha en `PORT`, por defecto `3001`.

## Variables de entorno del servicio

Configurar en local y en el proyecto Vercel del servicio:

```env
DATABASE_URL=postgresql://...
SERVICE_TOKEN=token-interno
NODE_ENV=production
ALLOWED_ORIGIN=https://<monolito>.vercel.app
```

Notas:

- `SERVICE_TOKEN` debe coincidir con `ACCOUNTING_SERVICE_TOKEN` en el monolito.
- `PORT` solo se usa en local o servidores persistentes; Vercel lo ignora.
- Para Vercel serverless conviene usar una connection string/pooler compatible con serverless y revisar limites de conexiones de Supabase.

## Deploy en Vercel como proyecto separado

Crear un segundo proyecto Vercel apuntando al mismo repo.

Configuracion recomendada:

- Root Directory: `services/accounting`
- Framework Preset: Other
- Install Command: `pnpm install`
- Build Command: `pnpm build`

El archivo `vercel.json` reescribe rutas root hacia la Function en `api/index.ts`, pasando el path original como query param para que Express reciba la ruta real. Por eso el servicio conserva rutas como:

- `/health`
- `/preview`
- `/eventos`
- `/diario`
- `/mayor/:cuentaId`
- `/libros/iva`
- `/libros/iibb`
- `/informal-entries`

En el monolito configurar:

```env
ACCOUNTING_SERVICE_URL=https://<accounting-service>.vercel.app
ACCOUNTING_SERVICE_TOKEN=token-interno
```

No usar slash final en `ACCOUNTING_SERVICE_URL`.

## Validacion

Desde la raiz del repo:

```bash
pnpm --filter @rhinos/accounting-service typecheck
pnpm --filter @rhinos/accounting-service typecheck:vercel
pnpm --filter @rhinos/accounting-service test
pnpm --filter @rhinos/accounting-service build
```

Despues del deploy:

```bash
curl https://<accounting-service>.vercel.app/health
```

Debe responder con `{ "ok": true, "service": "accounting" }`.

## Migrations

Vercel no ejecuta las migrations. Correr los SQL de `migrations/` en orden contra la base configurada en `DATABASE_URL`.

Se pueden ejecutar desde Supabase SQL Editor o con `psql`.

### Orden de migraciones para la integración Meli en pruebas

Usar exclusivamente una base de pruebas identificada y autorizada. Mantener
desactivado `mercadolibre_accounting_enabled` hasta revisar la configuración,
ejecutar la prueba integral del usuario y confirmar la aprobación contable. Las
migraciones no activan el flag automáticamente. Antes de continuar, comprobar que estén aplicadas
todas las migraciones anteriores del proyecto y las del servicio contable hasta
023. No volver a ejecutar migraciones ya aplicadas: no todas son idempotentes.

Desde la raíz del repositorio, aplicar las siguientes migraciones de Supabase
pendientes, en este orden:

1. `supabase/migrations/20261121190000_mercadolibre_accounting_breakdown_drafts.sql`
2. `supabase/migrations/20261121210000_mercadolibre_accounting_payment_preparations.sql`
3. `supabase/migrations/20261122220000_mercadolibre_accounting_payment_dispatch_foundation.sql`
4. `supabase/migrations/20261123010000_mercadolibre_accounting_preparation_read.sql`
5. `supabase/migrations/20261123020000_mercadolibre_accounting_dispatch_recovery_read.sql`
6. `supabase/migrations/20261123030000_mercadolibre_accounting_dispatch_source_read.sql`
7. `supabase/migrations/20261123040000_mercadolibre_fiscal_accounting_preparations.sql`
8. `supabase/migrations/20261123050000_mercadolibre_fiscal_dispatch_foundation.sql`
9. `supabase/migrations/20261123060000_mercadolibre_payment_reversal_reservations.sql`
10. `supabase/migrations/20261123070000_mercadolibre_sale_accounting_reservations.sql`
11. `supabase/migrations/20261123080000_mercadolibre_sale_accounting_review.sql`
12. `supabase/migrations/20261123090000_mercadolibre_dispatch_application_grants.sql`
13. `supabase/migrations/20261123100000_meli_payment_dispatch_source_before_publication.sql`
14. `supabase/migrations/20261123110000_meli_fiscal_automatic_configuration.sql`
15. `supabase/migrations/20261123120000_meli_usd_allocation_rounding_guard.sql`
16. `supabase/migrations/20261123130000_meli_credit_note_fiscal_capacity.sql`

La migración `20261123100000` permite consultar la fuente de un componente antes de su
primer despacho, conservando las verificaciones de acceso. La publicación valida
el cuadre en pesos del desglose completo. La migración `20261123120000`
serializa por venta el despacho de notas y cobros USD y rechaza diferencias
acumuladas de pesos respecto de la cotización de la factura; los cobros con
varios componentes se cuentan una sola vez. No crea ajustes automáticos.
Una reversión puede cambiar la composición de los importes restantes; revisar
la conciliación de la venta después de anular un cobro.
La migración `20261123130000` también bloquea notas parciales cuya suma por
concepto fiscal exceda la factura, bajo el bloqueo de la venta. No sustituye
la revisión de las cuentas seleccionadas para las notas manuales.

En la base configurada para el servicio contable, aplicar las pendientes:

1. `services/accounting/migrations/024_meli_payment_reversal_foundation.sql`
2. `services/accounting/migrations/025_meli_journal_foundation.sql`
3. `services/accounting/migrations/026_meli_journal_recovery_foundation.sql`
4. `services/accounting/migrations/027_meli_reversal_recovery_foundation.sql`
5. `services/accounting/migrations/028_meli_posting_period_foundation.sql`
6. `services/accounting/migrations/029_meli_period_audit_foundation.sql`
7. `services/accounting/migrations/030_meli_reversal_source_verification.sql`
8. `services/accounting/migrations/031_meli_journal_integrity.sql`
9. `services/accounting/migrations/032_meli_test_chart_proposal.sql`
10. `services/accounting/migrations/033_meli_source_write_fence.sql`

Pueden usar la misma instancia o bases distintas: confirmar los destinos antes
de ejecutar. El historial de Supabase se consulta en
`supabase_migrations.schema_migrations`; ejecutar SQL manualmente no implica
necesariamente que el historial de la herramienta se actualice. Las migraciones
del servicio tienen su propia gestión; verificar sus objetos e historial de
despliegue antes de repetirlas. Detenerse ante cualquier error y revisar el
estado antes de continuar. No ejecutar archivos de `tests/` en esta base:
los fixtures indicados más abajo requieren instancias descartables separadas.

Para facilitar la inspección previa, ejecutar
`scripts/meli-accounting-migration-inventory.sql` desde el editor SQL contra
cada destino identificado. Es una consulta de solo lectura y muestra el nombre
de la base, objetos seleccionados presentes, privilegios `EXECUTE` de
`service_role` para los despachos y modo de los triggers; filtrar las filas por
el destino correspondiente. El modo `D` indica un trigger desactivado;
los modos de ejecución deben revisarse según la configuración del servidor.
Los nombres de funciones no comprueban su firma ni definición. La presencia
de los objetos no prueba que una migración esté completa o sea correcta, y
una ausencia no autoriza a repetirla: comparar también historial,
definiciones, permisos y prerrequisitos. El inventario no verifica las
migraciones anteriores ni autoriza habilitar la integración.

La propuesta de cuentas para revisión del contador está en
`scripts/seed-meli-chart-proposal.sql`. Es un seed **manual para pruebas**,
separado de las migraciones automáticas: antes de ejecutarlo en la base
contable, aplicar previamente la migración 032, reemplazar `NULL::uuid` por
el UUID de la organización de prueba y verificar el destino. La migración
instala la función, pero no cambia cuentas ni activa ningún flag. El seed crea
las cuentas propuestas que falten con
moneda `AMBAS` y reutiliza las existentes por código semántico. Un conflicto
de código, tipo, naturaleza o disponibilidad revierte la transacción. No
cambia reglas ni flags. Por defecto no modifica cuentas existentes: si se
requieren pruebas USD y sus cuentas son ARS, se puede cambiar explícitamente
el segundo argumento a `true` para ampliar esas cuentas a `AMBAS`.
Esto afecta su disponibilidad también para otros canales de esa organización;
usar exclusivamente en una base y organización de prueba autorizadas.
El resultado identifica cuentas creadas, existentes o ampliadas. La propuesta
no constituye aprobación del contador y no conecta el publicador.
La vista preliminar fiscal sugiere deudores, ventas Meli, IVA débito fiscal y
tributos a pagar por código semántico solo cuando la cuenta está disponible
para la moneda y es única. Las sugerencias no son validación contable y pueden
cambiarse; una cuenta ausente o incompatible queda sin seleccionar.

Con el flag apagado se pueden comprobar el arranque, permisos y flujo comercial
existente; para probar borradores o preparaciones se necesitan permisos y una
organización de prueba. La aplicación ya conecta la publicación fiscal y por
componente de cobro, la recuperación de envíos y la reversión recuperable con
conciliación previa. La prueba integral en las bases configuradas y la revisión
contable aún deben realizarse antes de habilitar el flag o publicar en producción.

La revisión manual por venta de la migración `20261123080000` reúne datos
operativos y consultas contables separadas; admite hasta 200 notas y 200 cobros
por venta. No bloquea cambios entre consultas, no descubre todos los orígenes
externos ni solicitudes en tránsito, y no constituye una conciliación ni
autoriza publicación o anulación. Los importes mostrados no son saldos contables.

La preparación fiscal guarda su clave y el usuario esperado en el almacenamiento
de la pestaña antes de enviarla. Tras recargar, reintentar con el usuario original;
el servidor obtiene el actor de la sesión y rechaza otro usuario. Si el
almacenamiento falla no se envía una solicitud nueva. Al cerrar la pestaña se
pierde esa copia; consultar la preparación y revisar cualquier solicitud aún en
tránsito antes de iniciar otra. Preparar no publica; la acción explícita de
publicación verifica fuente, cuentas, antecedente, período, historia y recibo.

La preparación de cobros también conserva en la pestaña el cobro, desglose,
clave y usuario esperado. Tras una respuesta incierta, reintentar con el mismo
usuario incluso si la preparación ya aparece activa; la cancelación queda
bloqueada hasta recuperar el resultado. Una respuesta de error no demuestra que
una solicitud anterior haya terminado y no autoriza cambiar la clave. Si se
cierra la pestaña o falla el almacenamiento, revisar manualmente el estado y
las posibles solicitudes en tránsito. La acción por componente conserva y
recupera el payload y la clave durables; no crea una clave nueva al reintentar.

El coordinador de publicación conserva la solicitud, verifica el recibo y
recupera confirmaciones sin crear asientos duplicados. Sus adaptadores de
aplicación llaman al servicio contable y a las RPC de despacho, y validan
cuentas, fuentes, períodos e historia antes de cada envío. La migración 033
serializa las escrituras contables Meli por origen y bloquea escrituras genéricas
sobre fuentes con despachos vinculados. Esto no sustituye la prueba integral ni
la revisión de datos históricos.

El coordinador de reversión está conectado al flujo de anulación comercial:
reserva claves durables, verifica los originales y contra-asientos, concilia la
historia, confirma cada componente y solo entonces finaliza la anulación. Los
reintentos reutilizan la reserva. Requiere permisos contables, período abierto
y aplicación de las migraciones indicadas; no se ha ejecutado una prueba
integral contra las bases del usuario.

La migración 028 agrega un control aislado y provisional de períodos mensuales
Meli: ningún mes queda abierto automáticamente. La creación de asientos Meli y
sus contra-asientos exige un período `OPEN` para la organización y la fecha,
bajo bloqueo compartido hasta completar la transacción; los reintentos de una
solicitud ya registrada no vuelven a crear el asiento. No modifica la operación
de otros canales. La migración 029 agrega una operación interna idempotente de
cambio con estado esperado, motivo, actor y registro histórico. La autorización
y la interfaz se describen más abajo. Un reintento devuelve el resultado
histórico, no necesariamente el estado actual. No es una auditoría completa:
los cambios directos de un propietario de la base eluden esa operación. La
aprobación contable y la prueba integral en la base de prueba siguen pendientes;
no habilitar la integración para producción.
La revisión fiscal ofrece una consulta de solo lectura del período asociado a la
fecha del comprobante autorizado, bajo los permisos y controles de acceso Meli.
Un resultado abierto es informativo y puede cambiar antes de publicar; solo la
guarda transaccional decide al registrar. Esta consulta requiere la migración 028
y no publica asientos. El cambio de período es una acción separada.

La migración Supabase `20261123040000` prepara una copia durable de la fuente
fiscal autorizada de facturas y notas, con clave idempotente, actor, acceso por
organización y depósito, y lectura de recuperación aun con el flag desactivado.
La nota debe conservar la asociación fiscal con la factura. Las funciones no
publican asientos. Desde la revisión fiscal, usuarios autorizados pueden preparar
o consultar esa fuente sin modificar el comprobante; la acción de publicación
valida el snapshot completo, las cuentas, los antecedentes, el período y la
historia, y conserva su propio payload y estado de despacho antes de invocar
Contabilidad. El test `supabase/tests/mercadolibre-fiscal-accounting-preparations.sql`
crea roles y fixtures y solo debe ejecutarse en una instancia descartable nueva.
La migración `20261123110000` registra un pendiente durable al persistir la
autorización de una factura o nota Meli. Antes de emitir, un administrador
puede revisar y guardar desde la página de ventas la propuesta de deudores,
ventas e IVA para cada moneda, sin modificar el plan de cuentas. Desde la
revisión de un comprobante puede guardar cuentas revisadas para su moneda y los
conceptos presentes; las asignaciones de IVA se identifican por código ARCA y
las de tributos por código y descripción. Conceptos no configurados quedan
pendientes. La emisión y la conciliación intentan publicar con esa configuración
después de guardar la autorización, sin reemitir si falla Contabilidad.
El intento conserva los permisos y el acceso de depósito del usuario fiscal:
si no tiene permiso contable, el comprobante queda pendiente para revisión;
no existe aún un trabajador autónomo con identidad de servicio. Un despacho
existente conserva su actor y payload originales y puede requerir al actor
original para reintentarlo. La acción de revisión permite reintentar el
pendiente sin acudir a ARCA. Comprobantes históricos anteriores a la migración
siguen usando la publicación individual manual.
Las notas y los cobros exigen que el asiento antecedente de la factura coincida
con el comprobante fiscal autorizado. La automatización requiere ensayo integral
de migraciones, permisos, fallos y concurrencia antes de habilitarse.

La migración `20261123050000` agrega una base aislada para conservar la solicitud
fiscal exacta antes de su envío (`UNCERTAIN`) y confirmar un recibo (`PUBLISHED`).
La recuperación de la solicitud está protegida por organización, usuario y
depósito. Solo el autor de la preparación puede iniciar el despacho; otro
usuario autorizado puede consultar o confirmar la recuperación. Las funciones
de inicio y confirmación son accesibles solo a `service_role` tras aplicar la
migración 20261123090000: no verifican por sí mismas las cuentas, los antecedentes
ni la conciliación, y no publican asientos. La aplicación confirma solo después
de verificar el recibo exacto. Una ausencia en Contabilidad no demuestra que otro envío no esté
en curso. La consulta interna por solicitud también admite factura y nota, pero
solo verifica el recibo persistido; no envía ni confirma. El ensayo
`supabase/tests/mercadolibre-fiscal-dispatch-foundation.sql` crea roles y datos
de prueba y solo debe ejecutarse en una instancia descartable nueva. No sustituye
pruebas con migraciones completas ni de concurrencia real.
La revisión fiscal ofrece una consulta manual que coteja la solicitud durable
con el comprobante autorizado, su moneda, fecha y desglose, comprueba la cuenta
de deudores y consulta el recibo exacto en Contabilidad. Para notas invierte la
orientación. Verifica existencia de las demás cuentas, pero no certifica que su
clasificación fiscal sea correcta ni que la venta esté conciliada. Un recibo
encontrado con estado `UNCERTAIN` no se confirma automáticamente. La pantalla
requiere las habilitaciones Meli aunque la lectura de recuperación del servidor
no requiera el flag; no hay recuperación visual con el flag desactivado.

La migración `20261123060000` agrega una reserva aislada para reversión de
cobros. Bajo los mismos bloqueos de venta y cobro exige resolver los envíos
inciertos, conserva las solicitudes y claves de reversión por componente
publicado, e impide nuevos despachos mientras exista la reserva. Una función
de lectura protegida permite recuperarla con el flag apagado; las funciones
de reserva y confirmación son solo para `service_role` tras aplicar
20261123090000. La aplicación verifica el recibo exacto en Contabilidad antes
de confirmar cada componente. La reserva no invoca contra-asientos ni permite
cancelar la preparación. Existe una función interna de finalización transaccional,
accesible solo a `service_role`, que exige todas las reversiones confirmadas, compara los
componentes con los despachos y usa la anulación comercial existente. La
aplicación admite preparaciones parcialmente publicadas, siempre que ningún
envío esté incierto; comprueba previamente cada recibo y concilia la historia.
Esta ruta aún requiere verificación integral en un entorno de prueba;
la función no consulta Contabilidad y no es invocable desde el navegador.
El ensayo
`supabase/tests/mercadolibre-payment-reversal-reservations.sql` crea roles y
fixtures y solo debe ejecutarse en una base descartable. No reemplaza pruebas
de concurrencia real ni de transacciones distribuidas.
El ensayo `supabase/tests/mercadolibre-reversal-concurrency.cjs` crea y elimina
una base temporal separada en un servidor PostgreSQL de prueba autorizado. Exige
los roles `anon`, `authenticated` y `service_role`, permisos para crear y eliminar
bases y para terminar las conexiones de la base temporal, y las dependencias del
servicio instaladas. Desde la raíz del repositorio:

```powershell
$env:MELI_TEST_DATABASE_ADMIN_URL = '<URL administrativa del servidor de prueba>'
node supabase\tests\mercadolibre-reversal-concurrency.cjs
```

Prueba los dos órdenes concurrentes de reserva y despacho, y la finalización
contra el RPC y el trigger comerciales reales, usando un fixture simplificado con
permisos simulados. No valida migraciones integrales, permisos reales,
publicación, conciliación ni transacciones distribuidas.
La ruta interna autenticada `/internal/meli/reversal/lookup` solo recupera un
contra-asiento verificado por clave y solicitud; no ejecuta ni confirma la
reversión. Una respuesta ausente no demuestra que otro envío no siga en curso.
La migración 030 y la ruta interna `/internal/meli/reversal/source/inspect`
verifican además el original contra su solicitud durable, incluso después de
la reversión, y comprueban que no existan contra-asientos inesperados. La
consulta de la reserva usa esta verificación para cada componente. El bloqueo
del original serializa la lectura con la creación de su contra-asiento y la
consulta bloquea las líneas existentes mientras dura la transacción. Esos
bloqueos se liberan al terminar la consulta y no protegen la confirmación
posterior en otro servicio. No sustituye
la conciliación ni ejecuta o confirma una reversión. También coteja moneda,
fecha, importe, cuentas y cotización de cada solicitud con la fuente comercial
y fiscal, tanto para cobros registrados como para cobros ya anulados.
La misma migración agrega `accounting.reverse_verified_meli_payment`, una
primitiva interna idempotente que verifica el payload original, crea el
contra-asiento y verifica ambos en una sola transacción contable. No está
expuesta por HTTP ni autoriza actores, valida el origen comercial, confirma
componentes o finaliza anulaciones; requiere el coordinador distribuido.
La migración 031 protege contra cambios ordinarios las cabeceras, líneas y
recibos Meli vinculados, incluidos los contra-asientos de cobro. Serializa las
inserciones concurrentes durante la creación y rechaza reversiones genéricas de
facturas, notas y contra-asientos Meli. También rechaza cualquier contra-asiento
referido a un original inexistente o no visible en la transacción; las
reversiones ordinarias con original visible siguen permitidas. Las pruebas
incluyen READ COMMITTED, REPEATABLE READ y SERIALIZABLE. Un propietario puede desactivar los
triggers; la guarda no detecta asientos externos ni reemplaza conciliación,
coordinación entre servicios o permisos. No habilita la publicación.
Existe un coordinador de reversión en
`src/modules/mercadolibre/service/meli-reversal-coordinator.ts`, conectado al
flujo comercial de anulación. Verifica cada recibo original y contra-asiento,
reconcilia la historia antes y después de confirmar componentes, y finaliza el
cobro solo al terminar todos los pasos. La prueba integral con las bases
configuradas sigue pendiente.
La revisión del período fiscal permite abrir o cerrar el mes después de
consultarlo, con motivo y estado esperado. La acción exige los permisos
`accounting.manage` y `mercadolibre.accounting.manage`, acceso al módulo POS y
ambos flags contables; usa el actor de la sesión y una ruta interna protegida
por token. La migración 029 debe estar aplicada y el usuario de la conexión
contable debe poder ejecutar su función. La pantalla guarda la solicitud antes
del envío en el almacenamiento de la pestaña y permite reintentarla con la
misma clave después de recargar, únicamente con el usuario original. Si el
almacenamiento no está disponible o el cambio arroja conflicto, no inicia una
solicitud nueva; revisar la auditoría. Al cerrar la pestaña se pierde esta
copia local: conservar la clave y revisar la auditoría antes de actuar. Una respuesta
idempotente registra el resultado histórico, por lo que la pantalla exige
consultar nuevamente el estado actual. No protege cambios directos del dueño
de la base ni habilita la publicación de asientos.
La prueba `tests/meli-period-http.ts` usa un servidor HTTP real y una base
temporal que crea y elimina, y requiere `MELI_TEST_DATABASE_ADMIN_URL` apuntando
a un servidor de prueba autorizado. Desde `services/accounting` se ejecuta con
`node_modules\.bin\tsx.CMD tests\meli-period-http.ts` en Windows. Comprueba
autenticación, apertura, reintento, conflicto, cierre y auditoría; no prueba
los permisos reales del monolito ni la publicación de asientos.
La pantalla de cobros puede consultar la reserva y sus recibos, incluso con el
flag desactivado cuando existe una preparación con envíos. El cotejo verifica
que los componentes correspondan a los despachos publicados y contrasta cada
recibo con Contabilidad. También compara la historia del origen con los
originales de la reserva y las reversiones verificadas, señalando asientos
ajenos, inactivos o faltantes. Esta lectura es una instantánea separada de las
verificaciones, puede cambiar inmediatamente y no impide envíos en tránsito.
La acción de anulación inicia o recupera el proceso durable; esta consulta no
lo inicia ni confirma, y no certifica la conciliación completa de la venta.
La consulta del despacho fiscal también coteja su recibo con la historia del
comprobante y advierte sobre asientos ajenos, faltantes o reversados. Esta
consulta puntual tampoco detecta solicitudes en tránsito ni acredita las
cuentas fiscales o la conciliación de la venta.

La migración Supabase `20261123070000` agrega una guarda interna de capacidad
por venta: bajo bloqueo de la venta exige factura publicada y reserva el importe
completo de cada cobro con al menos un envío, una sola vez, y de cada nota con
envío. Los envíos inciertos también consumen capacidad; un cobro solo deja de
consumirla cuando su anulación y reserva de reversión están finalizadas. Rechaza
que notas y cobros superen la factura en la moneda de origen. No modifica el
saldo comercial.

Esta guarda **no es conciliación integral**: no comprueba recibos ni asientos
externos en Contabilidad, diferencias de cambio, cuentas, fuentes históricas o
fiscalización. Las funciones de envío se conceden únicamente a `service_role`
por la migración `20261123090000`; mantener el flag apagado hasta completar la
prueba integral y la revisión contable. El ensayo
`supabase/tests/mercadolibre-sale-accounting-reservations.sql` usa un esquema
simplificado y solo debe ejecutarse en una base descartable. El ejecutor de
concurrencia indicado abajo verifica ambos órdenes de una nota y un cobro que
compiten por el saldo; no sustituye pruebas de publicación distribuida.

### Base de reversión de cobros Mercado Libre

La migración `024_meli_payment_reversal_foundation.sql` agrega una función
aislada y una tabla de vínculos; no conecta la anulación comercial ni publica
asientos. La función conserva activos el original y su contra-asiento para que
ambos aparezcan en Diario y Mayor. En USD exige importes y cotización verificables.
No habilitar su uso desde la aplicación hasta implementar autorización, bloqueo
coordinado de todas las vías de reversión, control de períodos, recuperación y
pruebas concurrentes en un entorno representativo.

La prueba `tests/meli-payment-reversals.sql` debe ejecutarse únicamente en una
base descartable vacía, después de las migraciones 001, 002, 006 y 024. No
sustituye la validación de migraciones completas ni de concurrencia en Supabase.

La migración `025_meli_journal_foundation.sql` agrega una función transaccional
aislada para asientos Meli con comparación de payload, unicidad por componente,
cuentas de la organización y conservación de importes y tasa. No valida por sí
sola el origen fiscal u operativo, los permisos, períodos, antecedentes o
conciliación; no debe exponerse ni conectarse a la aplicación hasta completar
esos controles y la recuperación distribuida. La migración 026 agrega una
consulta interna por clave que verifica organización y payload y serializa con
la escritura por la misma clave. Si no encuentra una solicitud, esto no prueba
que no exista un envío en tránsito: cualquier reintento debe conservar la
misma clave y el mismo payload. Su prueba `tests/meli-journal-foundation.sql`
se ejecuta únicamente en una base descartable, después de 001, 002, 006,
024, 025 y 026. Para un componente de cobro se admite una nueva solicitud solo
si todas las versiones anteriores tienen un vínculo de reversión Meli y sus
cabeceras y líneas coinciden con la solicitud original y el contra-asiento; para
factura y nota sigue permitiéndose una sola solicitud por origen. La exclusión
utiliza bloqueos transaccionales y aún requiere pruebas concurrentes reales.
La prueba `tests/meli-journal-reversal-integration.sql` requiere ambas
migraciones 024 y 025 y verifica la compatibilidad de las funciones aisladas.
El contrato interno tipado `src/modules/journal/meli-journal.foundation.ts`
reconstruye el payload de recuperación usando los mismos tipos PostgreSQL
que la creación. No expone rutas ni reemplaza las validaciones del orquestador.
El coordinador interno conecta creación y recuperación y exige verificar la
misma solicitud antes de devolver un identificador. Ante una respuesta ausente
o una consulta fallida, el resultado sigue siendo incierto: el llamador debe
conservar la clave y el payload durables. La aplicación ya conecta este flujo
con la acción de publicación y la confirmación durable en Supabase.
La migración 027 incorpora la recuperación de una reversión por clave y datos
exactos. Además serializa los contra-asientos de cobros Meli sobre el original,
rechaza claves genéricas y duplicados. Esta protección no sustituye permisos,
validación del recibo, reserva de anulación ni conciliación; escrituras directas
con un rol privilegiado no deben considerarse una interfaz autorizada.
Las consultas de recuperación de 026 y 027 también comparan las cabeceras y las
líneas efectivamente persistidas, incluyendo importes, moneda y duplicados.
Por sí solas estas consultas no garantizan inmutabilidad ni confirmación
distribuida. La migración 031 agrega guardas para los recibos vinculados, pero
la coordinación distribuida se conecta desde la aplicación; queda pendiente la
prueba integral del flujo en las bases configuradas.

Con los permisos y flags contables habilitados para pruebas, el borrador activo
de un cobro vigente ofrece una vista monetaria preliminar. Consulta el snapshot
fiscal autorizado de la factura, resuelve las cuentas del plan cargado y muestra
importes originales y equivalentes ARS; rechaza cuentas faltantes, incompatibles
o ambiguas y diferencias de redondeo. La vista es informativa: no confirma el
antecedente, el período ni la conciliación, y no genera ni publica asientos.

La aplicación también permite preparar los conceptos de un desglose vigente y
confirmar su publicación con el botón «Confirmar asiento». Cada concepto produce
un asiento separado; se publican secuencialmente y la operación se detiene ante
el primer error. Los anteriores se conservan y el mismo botón reintenta los
pendientes o inciertos sin volver a publicar los ya confirmados. Ante una
respuesta perdida, consultar los estados y reintentar la misma preparación;
no se garantiza una transacción atómica entre todos los conceptos.
Se puede cancelar la preparación si no hubo envíos. Mientras
exista una preparación activa, la base impide editar el desglose o anular el
cobro. La consulta y la cancelación segura siguen disponibles para usuarios
autorizados aun con el flag desactivado; si hubo un envío, la cancelación queda
bloqueada y la anulación comercial requiere la reversión contable recuperable.
Las versiones anteriores del desglose y los datos de auditoría se conservan en
la base, aunque no se muestran en la pantalla de cobros.
Preparar no crea asientos. La
consulta agrega una llamada por cobro para usuarios contables autorizados; su
fallo muestra un aviso y no impide cargar la página ni los controles comerciales.
Al revisar la historia de un cobro, la pantalla compara los identificadores de
envíos con los asientos consultados y advierte sobre envíos inciertos, asientos
ausentes, inactivos, revertidos o sin vinculación identificada. Esta revisión es informativa:
no compara importes ni acredita la conciliación y no resuelve los envíos.
La migración `20261123020000` y su adaptador interno permiten recuperar la clave,
payload y auditoría de un envío por componente, con validación de organización,
permisos y depósito incluso con el flag apagado. No habilitan el despacho ni
la confirmación y no exponen el payload al cliente. La ausencia de una fila no
demuestra que otro intento no esté en tránsito; nunca cambiar clave o payload
por ese motivo.
El botón de verificación consulta el servicio contable con el payload durable y
solo muestra si se verificó un asiento; no reenvía ni confirma la publicación.
La publicación de cada componente reusa su solicitud durable en reintentos,
valida el recibo del servicio contable y confirma el despacho en Supabase.
La consulta rechaza un original vinculado a una reversión o contra-asiento;
esta comprobación no bloquea cambios concurrentes ni certifica conciliación.
La migración `20261123030000` permite cotejar previamente fecha, moneda, vigencia,
importe, orientación y cuentas del componente con el despacho. Las cuentas
semánticas se contrastan con el plan de cuentas actual de la organización;
un cambio posterior de cuenta puede exigir revisión manual. También comprueba
la moneda y la cotización contra el snapshot fiscal autorizado de la factura.
La revisión requiere acceso a la venta y su comprobante aun con el flag apagado;
una factura inaccesible o inconsistente impide verificar el envío. Esto no
constituye conciliación completa.
La ruta interna de consulta requiere el token de servicio y el proxy del
monolito rechaza rutas internas. Si no se encuentra un asiento, el resultado
permanece incierto. Ante discrepancias se informa error y se requiere revisión.
La revisión de factura puede consultar, por separado, el recibo de una solicitud
fiscal Meli y cotejarlo con su comprobante autorizado, importes, moneda,
cotización y cuenta de deudores. Rechaza asientos revertidos o alterados; no
certifica la clasificación de las cuentas de ventas e impuestos y no identifica
asientos externos ni solicitudes en tránsito. La ruta es interna y de solo
lectura; exige las migraciones contables 025 y 026 y no crea asientos.

### Ensayo aislado de las bases Meli

Estos ensayos no prueban una integración funcional ni habilitan publicación.
No usar bases existentes, productivas ni conexiones de los archivos `.env`.
El usuario debe crear y verificar previamente instancias PostgreSQL descartables
separadas; los archivos de prueba de Supabase crean roles a nivel de instancia,
tablas y datos de prueba y no hacen rollback de todo. No ejecutarlos en una
instancia compartida, aunque la base elegida esté vacía.

En una instancia descartable con rol `postgres`, desde la raíz del repositorio,
configurar `MELI_TEST_DATABASE_URL` manualmente apuntando a una base vacía y
ejecutar con `psql` instalado:

```powershell
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\001_create_schema.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\002_initial_tables.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\003_plpgsql_create_journal.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\004_plpgsql_contra_asiento.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\006_add_usd_to_journal.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\024_meli_payment_reversal_foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\025_meli_journal_foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\026_meli_journal_recovery_foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\027_meli_reversal_recovery_foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-payment-reversals.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-journal-foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-journal-reversal-integration.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-reversal-recovery-foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\028_meli_posting_period_foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-posting-period-foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\029_meli_period_audit_foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-period-audit-foundation.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\030_meli_reversal_source_verification.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-reversal-source-verification.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\migrations\031_meli_journal_integrity.sql
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f services\accounting\tests\meli-journal-integrity.sql
```

Para comprobar la serialización real del cierre con la inserción de asientos y
los cambios simultáneos de período, la verificación concurrente del original
frente a su reversión y la capacidad de la venta,
`services/accounting/tests/meli-period-concurrency.cjs`
crea y elimina una base temporal separada. Requiere un servidor de prueba
autorizado, los roles existentes de Supabase y permisos administrativos para
crear y eliminar bases y cerrar sus conexiones:

```powershell
$env:MELI_TEST_DATABASE_ADMIN_URL = '<URL administrativa del servidor de prueba>'
node services\accounting\tests\meli-period-concurrency.cjs
```

La prueba también verifica inserciones concurrentes en recibos y reversiones.
Usa un esquema aislado y no sustituye la validación integral ni la autorización
de administración de períodos. La prueba adicional
`tests/meli-journal-integrity-roles.sql` crea un rol de PostgreSQL y solo debe
ejecutarse en una instancia descartable completa, no en un servidor compartido.

Detenerse ante cualquier error: PowerShell no interrumpe automáticamente las
líneas siguientes cuando `psql` devuelve un código distinto de cero. Las pruebas
contables usan rollback de sus datos, pero las migraciones modifican la base.

En **otra instancia descartable nueva**, también vacía y con permisos para crear
roles, ejecutar solo el siguiente archivo; sus inclusiones `\ir` cargan las
pruebas y migraciones de borradores y preparación antes de la prueba de despacho:

```powershell
psql $env:MELI_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f supabase\tests\mercadolibre-accounting-dispatch-source-read.sql
```

Cambiar previamente la variable para que apunte a esa segunda instancia.
Estos fixtures usan un esquema simplificado: no reemplazan la aplicación
integral de migraciones Supabase y contables en un entorno representativo, ni
prueban concurrencia, conciliación, publicación, anulación o libros.
Para un ensayo de migración integral, aplicar las migraciones normales del
proyecto y del servicio en orden sobre un entorno de prueba autorizado y
verificar su historial; no volver a ejecutar SQL ya aplicado. Mantener el flag
Meli desactivado hasta que el contador revise las cuentas y se complete la prueba
integral de publicación, conciliación y reversión recuperable.

La revisión fiscal de una nota Meli exige una factura autorizada y verifica que
el comprobante asociado en la solicitud ARCA, los campos persistidos de la nota
y la factura de origen coincidan. Las notas históricas sin esta evidencia
quedan para revisión; la consulta no modifica ni reemite comprobantes.

Al consultar los datos fiscales autorizados de una factura o nota, la aplicación
permite asignar cuentas activas e imputables compatibles con la moneda y revisar
una propuesta en moneda original y pesos. Utiliza la cotización fiscal, invierte
los lados para notas de crédito y rechaza diferencias de redondeo; no persiste
las asignaciones ni publica asientos. Los períodos, antecedentes y conciliación
siguen requiriendo controles antes de habilitar una publicación. La consulta de
cuentas requiere además el permiso de lectura contable (`accounting.read`).

## Arquitectura de rutas

El handler serverless normaliza el prefijo `/api` antes de entregar la request a Express. Esto permite que funcionen ambos formatos:

- `https://<service>.vercel.app/health`
- `https://<service>.vercel.app/api/health`

Internamente Express sigue recibiendo `/health`, `/preview`, `/eventos`, etc.