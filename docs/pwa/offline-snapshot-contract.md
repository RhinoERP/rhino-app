# Snapshot offline del vendedor

## Integridad firmada para uso comercial offline

El endpoint puede incluir `X-Snapshot-Signature`, token HMAC versionado que
vincula hash del contenido comercial, usuario, organización, versión de schema,
`snapshotId`, `generatedAt` y `expiresAt`. El secreto
`OFFLINE_SNAPSHOT_SIGNING_SECRET` es solo de servidor y debe tener al menos 32
bytes. Registros IndexedDB previos a esta firma quedan sin firma y deberán
descargar el snapshot nuevamente antes de preparar cotizaciones offline.

El snapshot incluye precios de venta calculados por producto/nivel (sin exponer
el costo en claro), niveles de precio (margen, vigencia y estado) y las listas
de venta ya existentes. Estos campos forman parte del hash firmado. Se
mantienen opcionales al leer registros V1 anteriores por compatibilidad; el
futuro comando de cotización offline debe rechazar un snapshot si le faltan los
insumos que requiere su selección de precios, no completar datos comerciales
desde IndexedDB ni recalcularlos con valores actuales.

### Decisiones de negocio: costo y vigencia

- No exponer el costo de compra en claro al dispositivo. Para niveles de precio,
  el servidor debe emitir precios de venta ya calculados y firmados por producto
  y nivel; el cliente offline no recibe el costo como insumo de cálculo.
- La solicitud de cotización sí debe conservar el costo unitario usado como
  snapshot de auditoría. Se incluye cifrado AES-256-GCM, autenticado con
  organización, usuario, snapshot y producto; solo servidor puede descifrarlo.
- Si falta la clave o no se puede descifrar el costo, la sincronización enviará
  la solicitud sin costo histórico y mostrará una advertencia. Nunca sustituirá
  ese valor con el costo actual.
- Si una lista asignada al cliente deja de estar activa después de preparar la
  cotización, se acepta el precio/lista firmado que se usó offline. Se informa
  la situación al aprobador, que conserva la decisión final.

En una respuesta `304`, el endpoint vuelve a firmar la vigencia renovada para el
mismo contenido y `snapshotId`. El cliente envía ese ID mediante
`X-Snapshot-Id` y persiste la nueva firma junto al snapshot. Esto mantiene
correcta la advertencia de vencimiento y no obliga a transferir de nuevo el
contenido.

La RPC `create_sales_quote_request_idempotent` incorpora una clave única por
organización/vendedor/comando y un hash del payload. Repetir exactamente el
mismo comando devuelve el mismo `request_id`; reutilizar la clave para un payload
distinto se rechaza. El comando offline utiliza esa clave al crear la solicitud.

La primera ruta de envío offline de cotizaciones queda en
`POST /api/v1/offline-sales-quote-requests`. Valida el HMAC del snapshot,
identidad y permisos actuales; verifica referencias activas de cliente/producto
sin reemplazar los datos comerciales capturados; usa precios, impuestos y listas
del snapshot firmado; permite que se haya vencido; descifra el costo solo en el
servidor y persiste alertas de snapshot vencido/costo ausente en la solicitud.
La migración `20261110000000_sales_quote_request_idempotency.sql` debe aplicarse
antes de habilitar esta ruta en el entorno: añade la tabla idempotente y los
campos de auditoría de origen offline.

El formulario de nueva solicitud guarda en IndexedDB un comando con el
snapshot/firma y los datos de cotización cuando se envía sin conexión. La cola
se reintenta al recuperar conectividad desde el administrador offline de la
organización, y sus registros se eliminan con el purgado por propietario u
organización. La pantalla del cotizador muestra pendientes, sincronizadas y las
que requieren revisión; permite reintentar errores corregibles. Los intentos
marcados como `syncing` y abandonados por más de un minuto se recuperan al
reanudar la sincronización. La edición de solicitudes existentes sigue
requiriendo conexión.

El inicio instalado de la PWA conserva `/offline.html` como entrada estática
precargada y redirige a la pantalla única `/~offline`, también precargada junto
con sus chunks. Con conexión, esa pantalla continúa a Rhinos; sin conexión
ofrece los accesos a operaciones y datos locales. El fallback de navegación usa
la misma entrada, por lo que el inicio y la navegación muestran la misma UI.

La navegación offline usa la ruta pública precargada `/~offline/cotizaciones`,
que reconstruye el formulario a partir del snapshot firmado en IndexedDB. La
barra inferior usa esta ruta al detectar falta de conexión; no intenta cargar
la página protegida `/org/{slug}/solicitudes-venta/nueva` mediante RSC. Los
productos con variantes no se incluyen en el snapshot offline y no están
disponibles en ese formulario.

> **Estado al 2026-10-01:** snapshot, persistencia, borradores y sincronizacion implementados. El flujo basico fue probado en iOS con Supabase real; la descarga/refresco automaticos recientes aun requieren aceptacion manual en dispositivos y pruebas de aislamiento multi-organizacion.
>
> **Fecha:** 2026-09-14.

## Estado de implementacion

- Contrato Zod V1 creado en `src/modules/offline/contracts/seller-offline-snapshot.ts`.
- Feature flag y plazos agregados a la configuracion de organizacion.
- Endpoint inicial creado en `/api/v1/org/{orgSlug}/seller-offline-snapshot`.
- El endpoint filtra la cartera, excluye variantes y devuelve DTOs compactos.
- Persistencia IndexedDB implementada con `idb`, particion por usuario/organizacion/schema y validacion Zod en lectura y escritura.
- Control mobile implementado para preparar, actualizar y consultar el snapshot.
- Pantalla `/~offline/datos` implementada y precacheada para buscar clientes y productos sin red.
- Logout centralizado con purga previa de IndexedDB y React Query.
- Mantenimiento implementado para cambio de cuenta, `SIGNED_OUT`, reanudacion y 72 horas de inactividad.
- La formula de precios se comparte con el flujo de borradores; las diferencias se vuelven a validar en servidor al sincronizar.
- La PWA instalada prepara el primer snapshot automaticamente y comprueba cambios cada 20 minutos mientras permanece visible y online.
- Las comprobaciones usan `ETag`/`If-None-Match`; un `304` renueva la vigencia local sin transferir nuevamente el payload.

## Alcance

El snapshot permite consultar clientes y productos, preparar borradores de
preventa y sincronizarlos para organizaciones sin produccion. No cachea paginas
protegidas ni respuestas RSC.

## Decisiones iniciales

- Incluye clientes activos asignados al vendedor y clientes activos sin vendedor asignado.
- Usuarios con `sales.manage.all` u `organization.admin` pueden incluir todos los clientes activos.
- Vence 12 horas despues de su generacion.
- Un snapshot vencido no puede utilizarse para iniciar nuevas operaciones.
- Se purga inmediatamente al cerrar sesion o cambiar de cuenta.
- Se purga al abrir o reanudar la PWA despues de 72 horas sin actividad.
- iOS puede suspender la PWA; no se garantiza eliminacion fisica mientras permanece cerrada.
- Excluye productos con variantes durante el MVP inicial.
- Requiere un feature flag por organizacion independiente del shell PWA.

## Identidad y particion

Cada registro local pertenece de forma inmutable a:

```text
schemaVersion + ownerUserId + organizationId
```

El servidor deriva `ownerUserId` desde la sesion y `organizationId` desde una membresia activa. Nunca confia en IDs enviados por el cliente ni usa `orgSlug` como frontera de seguridad.

## Contrato V1

```ts
type SellerOfflineSnapshotV1 = {
  schemaVersion: 1;
  snapshotId: string;
  generatedAt: string;
  expiresAt: string;
  ownerUserId: string;
  organizationId: string;
  organization: OfflineOrganization;
  customers: OfflineCustomer[];
  products: OfflineProduct[];
  taxes: OfflineTax[];
  sellers: OfflineSeller[];
  salesPriceLists: OfflinePriceList[];
  customerPriceAssignments: OfflineAssignment[];
  purchasePriceListItems: OfflinePurchasePriceListItem[];
  settings: OfflineSalesSettings;
};
```

Los schemas Zod en codigo son la fuente ejecutable del contrato. Los DTOs deben seleccionar campos explicitos; no se serializan tipos `Row` completos de Supabase.

## Endpoint

```text
GET /api/v1/org/{orgSlug}/seller-offline-snapshot
```

Requisitos:

- Sesion autenticada y membresia activa.
- Permiso `sales.manage`, `sales.manage.all` u `organization.admin`.
- Modulo `wholesale` habilitado y produccion deshabilitada.
- Feature flag de snapshot habilitado para la organizacion.
- `Cache-Control: private, no-store`.
- Respuestas tipadas para no autenticado, prohibido, no habilitado y error interno.
- Metricas de duracion, filas y bytes serializados sin registrar datos comerciales.

El response informa headers de discovery:

```text
Server-Timing: snapshot;dur={ms}
X-Snapshot-Bytes: {bytes}
X-Snapshot-Customers: {cantidad}
X-Snapshot-Products: {cantidad}
X-Snapshot-Schema-Version: 1
ETag: "{huella-del-contenido}"
X-Snapshot-Generated-At: {fecha ISO}
X-Snapshot-Expires-At: {fecha ISO}
```

La huella excluye `snapshotId`, `generatedAt` y `expiresAt`. El endpoint siempre
vuelve a autenticar, autorizar y construir el snapshot fresco antes de responder
`304 Not Modified`; por lo tanto, una membresia revocada o un feature flag
deshabilitado no se ocultan detras del validador condicional.

## Actualizacion automatica

- Solo se activa automaticamente en modo PWA `standalone`.
- Se ejecuta al abrir, recuperar conectividad, volver a primer plano y cada 20
  minutos mientras la aplicacion esta visible.
- Usa Web Locks por usuario y organizacion, con single-flight dentro de cada
  contexto, para evitar descargas concurrentes.
- Conserva el snapshot anterior si la red, validacion o escritura local fallan.
- Un `304` actualiza `lastCheckedAt`, `generatedAt` y `expiresAt`, pero conserva
  el `snapshotId` para no alterar borradores existentes.
- Un `200` validado reemplaza el snapshot. Los borradores conservan el
  `snapshotId` anterior y pasan por la revision/migracion comercial existente.
- Safari iOS puede suspender timers; los 20 minutos son una frecuencia minima
  en foreground, no una garantia de ejecucion en background.

La funcionalidad queda deshabilitada por defecto para cada organizacion. Se configura desde los ajustes de preventa de la organizacion, no mediante un slug especial. Para habilitarla, la organizacion debe tener ventas mayoristas activas y produccion deshabilitada. La configuracion del piloto tiene esta forma:

```json
{
  "seller_offline_snapshot_enabled": true,
  "seller_offline_snapshot_ttl_hours": 12,
  "seller_offline_purge_after_hours": 72
}
```

## Discovery y limites

Antes de fijar limites se medira en organizaciones representativas:

- Clientes visibles por vendedor.
- Productos sin variantes.
- Impuestos, listas y asignaciones relevantes.
- Bytes del JSON serializado y transferido.
- Tiempo de generacion y descarga en red movil.
- Espacio ocupado en IndexedDB en Safari iOS y Chrome Android.

El primer endpoint puede entregar un snapshot completo. Si las mediciones exceden limites operativos razonables se agregaran cursor, version de dataset, tombstones y descarga incremental.

### Primera medicion piloto

Medicion realizada el 2026-09-16 mediante Quick Tunnel contra la organizacion `luchobet`, con un vendedor de alcance propio:

| Metrica | Resultado |
|---|---:|
| Estado HTTP | 200 |
| Schema | 1 |
| Clientes visibles | 3 |
| Productos sin variantes | 6 |
| JSON sin comprimir | 5.563 bytes |
| Duracion observada | 2.670 ms |

El volumen confirma que un snapshot completo es viable para esta organizacion piloto. La latencia no se toma aun como referencia de produccion porque la medicion incluye modo desarrollo y un tunel HTTPS; se repetira en caliente y en un build de produccion antes de fijar objetivos de rendimiento.

### Discovery de precios de `luchobet`

- La organizacion tiene 3 listas de compra de proveedores.
- No tiene listas de venta configuradas.
- Los 3 clientes visibles del vendedor no tienen asignaciones especiales por proveedor.
- El precio base del producto ya incorpora el resultado de la lista activa del proveedor mediante `products_with_price`.
- El snapshot no descarga costos generales. Solo incluye items de listas de compra cuando una asignacion de un cliente visible referencia explicitamente esa lista.
- La formula de precio fue extraida de `PreSaleForm` a `src/modules/sales/utils/pre-sale-pricing.ts` para compartirla y probar paridad entre online y offline.

## Reemplazo y borradores

Guardar un snapshot nuevo reemplaza el registro de la particion. Al abrir un borrador creado con otro `snapshotId`, la aplicacion revalida sus referencias y propone migrarlo al snapshot actual, actualizando precio e impuestos y mostrando cambios comerciales o referencias faltantes antes de permitir el envio.

## Pendientes actuales

- Validar en Safari iOS y Chrome Android la nueva preparacion automatica, refresco cada 20 minutos, respuestas 304 y expiracion renovada.
- Confirmar purga al cerrar sesion y al ingresar con otra cuenta.
- Probar vencimiento e inactividad con plazos reducidos en un entorno controlado.
- Completar la matriz manual de aislamiento entre usuario y organizacion en dispositivos reales y con mas de una organizacion habilitada.

## Repositorio local

La base `rhinos-offline` contiene:

```text
snapshots
state
```

`snapshots` usa la clave:

```text
schemaVersion:ownerUserId:organizationId
```

`state` conserva solamente el puntero al snapshot activo. Cada snapshot guarda `downloadedAt`, `lastActiveAt`, bytes y el payload V1 validado. Un registro invalido se elimina al leerlo.

La aplicacion solicita almacenamiento persistente mediante `navigator.storage.persist()` como mejora progresiva; el funcionamiento no depende de que el navegador lo conceda.

## Consulta offline

`/~offline/datos` es una ruta publica y precacheada que no consulta APIs ni paginas protegidas. Lee el snapshot activo desde IndexedDB y permite:

- Buscar clientes por razon social, fantasia, numero, CUIT o ciudad.
- Buscar productos por nombre, SKU, marca o proveedor.
- Consultar precio, impuestos incluidos en el contrato y stock de referencia.
- Identificar datos vencidos y su antiguedad.

El snapshot vencido puede consultarse como referencia, pero no habilita nuevas operaciones. Los borradores existentes permanecen disponibles y deben migrarse a un snapshot vigente antes de encolar.

### Prueba en dispositivo

La prueba de arranque en frio offline requiere un build de produccion:

```bash
pnpm build
pnpm start
```

Serwist sirve `precacheEntries: undefined` bajo `pnpm dev`, por lo que Safari puede mostrar su error nativo de falta de conexion en lugar del fallback. El bundle de produccion debe contener explicitamente `/~offline`, `/~offline/datos`, `/~offline/borradores` y `/~offline/preventa`. Despues de cambiar de dev a produccion se debe abrir la PWA con conexion y aceptar la actualizacion del Service Worker antes de activar modo avion.
