# Visitas comerciales (GPS)

## Base instalada

Las migraciones `20261112000000`, `20261112010000` y `20261112020000` ya fueron aplicadas según la confirmación del usuario. No editarlas ni reejecutarlas. Si se aplicaron con SQL Editor, conciliar el historial de Supabase CLI antes de usar `db push` para evitar recrear tablas o el cron.

El vendedor puede iniciar varios recorridos en el día, agregar clientes propios o sin asignación, reordenar, registrar llegadas manualmente, cerrar con motivos por cada cliente pendiente, reabrir y corregir registros equivocados conservando su auditoría. Visitas comerciales es independiente de la Hoja de Ruta de distribución. Requiere conexión, no hay seguimiento GPS en segundo plano ni visita automática.

## Vínculos comerciales y propuestas de puntos

`supabase/migrations/20261117000000_commercial_visit_links_and_points.sql` agrega vínculos comerciales auditables y propuestas explícitas de puntos. El usuario informó que la aplicó; el flujo autenticado sigue pendiente de pruebas.

**Actualización 18/11:** el usuario confirmó que aplicó `20261117000000`. Antes de desplegar la app, todavía debe validar el flujo autenticado y la aprobación de cotizaciones contra la base donde se aplicó.

### Sucursales y puntos de entrega: migración informada como aplicada

El usuario informó que ejecutó `supabase/migrations/20261118000000_customer_sites_for_visits_and_delivery.sql` en **ensayo**; falta validar las funciones y permisos con sesiones autenticadas. Se crea una sucursal «Principal» por cliente con la dirección existente y, si había un punto aprobado, sus coordenadas. Los clientes sin dirección requerirán que el administrador complete la sucursal antes de asignar nuevas entregas. No modificar ni reejecutar esta migración aplicada.

- Solo `organization.admin` crea, edita o desactiva sucursales desde la ficha del cliente. Puede cargar coordenadas iniciales opcionales. El vendedor no puede crearlas: selecciona una sucursal para cada visita comercial, incluso dos del mismo cliente en el mismo recorrido. Las visitas existentes quedan asociadas a «Principal» y conservan su historial.
- Después de registrar una visita, el vendedor puede proponer un nuevo GPS o pin para esa sucursal y, si se mudó, dirección y ciudad nuevas. El punto y la dirección vigentes se conservan hasta que el administrador apruebe o rechace. El GPS de llegada a la visita sigue sujeto a la purga de 30 días.
- Al agregar **cada venta confirmada** a una Hoja de Ruta se elige la sucursal de entrega. La asignación guarda una copia del nombre, dirección y ciudad en la venta y el PDF de la hoja muestra la dirección seleccionada. Los cambios futuros al punto maestro no reescriben esas copias. No se cambia la creación ni aprobación de cotizaciones o preventas.
- **No desplegar la app sin pruebas autenticadas de esta migración.** Confirmar primero el entorno y probar en ensayo: backfill de clientes con/sin dirección y de visitas existentes; permisos de administración y vendedor; dos sucursales del mismo cliente en una ruta; propuesta y rechazo/aprobación de mudanza; entrega de dos ventas del mismo cliente a domicilios distintos; PDF; corrección del punto después de asignar una venta, sin alterar la dirección registrada; retención de GPS y cron. No crear datos de prueba en piloto sin acordarlo.
- La asignación de varias ventas y el despacho **no son transaccionales como lote**: si falla una venta posterior, las previas permanecen asignadas; si falla el despacho, puede quedar una venta confirmada y asignada. La UI actualiza la hoja aun tras error, informa el estado parcial y permite reintentar el despacho desde esa venta conservando su dirección. Verificar las ventas ya asignadas antes de repetir una selección; si el despacho pasó a `DISPATCH` pero falló la actualización de la cuenta a cobrar, verificar/reconciliar esa cuenta antes de dar por completado el flujo.

**Verificación autenticada en ensayo/LuchoBet (18/11):** `.env.local` apunta a un proyecto distinto de `.env.prod`. Admin y vendedor iniciaron sesión por separado: el vendedor tiene `sales.manage`, no `organization.admin` ni `sales.manage.all`. El acceso anónimo al catálogo está denegado; el vendedor no pudo editar sucursales ni decidir propuestas, sí pudo planificar, confirmar manualmente sin documentos y proponer una mudanza; el administrador la vio en revisión y aprobó. Backfill: 4 clientes con sucursal y 2 visitas previas con sucursal y nombre histórico. En recorridos QA de ambos roles se planificaron dos sucursales del mismo cliente y se cerró con motivo para la no visitada. También se probó rechazo y aprobación de una propuesta: la dirección vigente no cambió antes de aprobar, y las visitas conservaron su snapshot.

Se crearon dos sucursales identificadas `QA sucursal ...` y una Hoja de Ruta **PENDING** marcada `QA` en LuchoBet. Las ventas de prueba **#7 y #13** quedaron asignadas a direcciones distintas; editar después una sucursal no alteró la dirección de la venta ni de la visita. Un PDF generado **en memoria** con las ventas y el template de la app imprimió ambos snapshots y no el domicilio maestro actualizado; falta probar la descarga desde el endpoint/app instalada. La venta #8 era `ADVANCE` y la base rechazó su asignación tras agregar #7: la hoja quedó parcialmente asignada. Por eso el código ahora excluye documentos distintos de `STANDARD` y sucursales con dirección/ciudad incompletas, valida **todo el lote** antes del primer RPC y rechaza reenvíos de ventas ya asignadas para no reescribir su destino. No se despacharon las ventas. **Pendiente:** prueba de descarga y flujo móvil, vínculo de documentos reales, purga temporal de GPS y reintento de despacho ante fallo de cuentas a cobrar.

- El vendedor pulsa **Registrar visita**: en ese momento la app pide GPS y abre un modal para seleccionar cotizaciones y preventas del mismo cliente, vendedor y día, o declarar que no hubo ninguna. Confirma explícitamente; puede hacerlo sin GPS como excepción. Crear cotizaciones o preventas sigue siendo independiente de Visitas.
- Después puede vincular otros documentos, incluso si se crearon antes de tocar el botón. Solo el administrador puede mover documentos ya vinculados a otra visita. Un documento pertenece a una sola visita; los movimientos registran actor y fecha. El historial incluye estados actuales, aunque se rechace una cotización o cancele una preventa.
- Si se aprueba una cotización vinculada, la preventa creada hereda su visita. También la hereda al vincular una cotización ya aprobada. Cotización y preventa resultante son una sola oportunidad comercial.
- El punto permanente del cliente se propone **por separado**, mediante GPS o un pin manual. El vendedor puede proponer el primer punto o una corrección; el administrador aprueba o rechaza esa propuesta, no el GPS de cada visita. El punto aprobado anterior sigue vigente hasta la aprobación de la corrección. No es obligatorio proponer un punto para registrar una visita.
- La migración elimina los antiguos puntos **pendientes generados automáticamente**; conserva los aprobados. Reemplaza la función del cron `archive-commercial-visits` existente: después de 30 días solo borra latitud, longitud y precisión de cada visita, conservando hora, método, ruta, historial y vínculos. La consulta mensual combina los antiguos totales (visitas ya eliminadas) y las visitas conservadas sin duplicarlas.
- El comando de cotización offline conserva el día local de preparación. La creación online persiste ese día mediante una envoltura transaccional del RPC existente. Ni la creación ni la aprobación de documentos requieren una visita.

## Límites y validación previa a producción

1. Las rutas no funcionan offline; no están en el snapshot ni en la cola de comandos. La app debe estar en primer plano para solicitar GPS.
2. No existe asociación supervisor ↔ vendedor: el acceso al GPS de otras personas y la aprobación de puntos son exclusivos de `organization.admin`.
3. El punto GPS o pin no prueba presencia física. Las teselas del mapa manual provienen de OpenStreetMap y requieren red.
4. Verificar en la base donde se aplicaron las migraciones la firma y ejecución de los RPC de creación y aprobación de cotización y de sucursales. **Orden de despliegue:** migraciones verificadas primero, luego código de la app, porque la creación online pasa a usar `create_sales_quote_request_with_day`.
5. Probar permisos entre vendedores y organizaciones, confirmación GPS/sin GPS, selección vacía y múltiple, reintentos y concurrencia, dos recorridos del mismo cliente, movimientos por administrador, herencia de preventa antes/después de aprobar, fechas cerca de medianoche y sincronización offline tardía.
6. Verificar el cron en `cron.job_run_details` y la purga de coordenadas sin eliminar visitas ni vínculos, así como la continuidad del histórico previo. Probar flujo autenticado en iPhone y Android instalados antes de expandir el piloto.

### Consultas de solo lectura para verificar la instalación

El repositorio no incluye las definiciones SQL de `create_sales_quote_request`, `review_sales_quote_request` ni `sales_quote_requests`: la sintaxis de la migración no confirma compatibilidad con esas funciones. **No volver a ejecutar el SQL de migración para averiguarlo.** Revisar el resultado de:

```sql
select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('create_sales_quote_request', 'review_sales_quote_request', 'create_sales_quote_request_idempotent')
order by p.proname;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('sales_quote_requests', 'sales_orders')
  and column_name in ('id', 'organization_id', 'customer_id', 'created_by', 'created_at',
    'sales_order_id', 'total_amount', 'user_id', 'sale_date', 'document_type', 'is_historical')
order by table_name, column_name;

select jobid, jobname, schedule, command from cron.job
where jobname = 'archive-commercial-visits';

-- Verificación de sucursales sin crear/modificar datos:
select to_regclass('public.customer_sites') as sites,
  to_regprocedure('public.commercial_site_catalog(uuid,uuid)') as catalog,
  to_regprocedure('public.commercial_route_add_site_visit(uuid,uuid,uuid,uuid)') as add_visit,
  to_regprocedure('public.commercial_site_assign_delivery(uuid,uuid,uuid,uuid,text)') as assign_delivery;

select count(*) as customers,
  count(*) filter (where not exists (
    select 1 from public.customer_sites s where s.customer_id = c.id
      and s.organization_id = c.organization_id)) as customers_without_site
from public.customers c;

select count(*) as visits,
  count(*) filter (where site_id is null) as visits_without_site
from public.commercial_visits;
```

Confirmar que la aprobación crea la preventa antes de asignar `sales_order_id`, que el estado de la preventa y el vendedor coinciden con las reglas de vínculo, y que las firmas de RPC son las esperadas. En una **copia aislada**, probar aprobación con cotización vinculada y sin vincular, permisos de vendedor/administrador, carreras de cierre y registro, y la purga. No hay PostgreSQL local disponible en este entorno (Docker daemon detenido).

**Lectura en ensayo (19/11):** `.env.local` y `.env.prod` apuntan a proyectos distintos; se consultó solo ensayo. LuchoBet tiene 4 clientes, 6 sucursales y 6 visitas: ningún cliente carece de sucursal y ninguna visita carece de `site_id`. El catálogo de sucursales se pudo consultar con sesiones separadas de administrador y vendedor; el acceso anónimo recibió `permission denied for function commercial_site_catalog`. No se consultó producción ni se ejecutó el cron manualmente. Las consultas de metadatos realizadas por el usuario están registradas en [`database-migrations.md`](./database-migrations.md).

**Resultado SQL Editor de ensayo (19/11, informado por el usuario):** el cron de purga está activo y sus cinco últimas ejecuciones fueron exitosas; el usuario aplicó en ensayo mediante SQL Editor la nueva migración `20261119000000` para revocar el acceso anónimo al lookup de replay. La prueba HTTP posterior y los grants SQL confirman la revocación. No quedan visitas sin sucursal ni visitas con GPS de más de 30 días; la purga efectiva a vencimiento aún no puede declararse probada. Antes de usar `supabase db push`, conciliar el historial de migraciones de Supabase CLI sin reejecutar SQL ya aplicado.

**Revisión posterior de producción configurada en `.env.prod` (19/11, solo lectura):** la API no expone las tablas de Visitas, sucursales ni vínculos, tampoco las RPC de sucursales ni las columnas de destino de entrega. Verificar la ausencia en SQL Editor antes de planear migraciones; no desplegar la app nueva en producción hasta tener un plan de base específico. No se aplicó SQL ni se cambió ningún dato.

**Procedencia confirmada por el usuario:** todas las consultas de SQL Editor compartidas hasta ese momento, incluido el historial de CLI, correspondían a ensayo (`.env.local`); ninguna de esas consultas era una verificación SQL de producción. Las migraciones de este trabajo se aplicaron exclusivamente en ensayo, no en el proyecto de `.env.prod`.

**Consulta SQL posterior del proyecto productivo solicitado:** `to_regclass` confirma que no están instaladas las tablas de cotizaciones, Visitas, recorridos ni sucursales consultadas; la RPC `commercial_site_catalog(uuid,uuid)` tampoco existe. La tabla `cron.job` existe, pero esto no acredita la instalación del job de purga. Producción continúa bloqueada para este despliegue.

**Comprobaciones posteriores en producción:** no hay columnas `sales_orders.delivery_site_%` ni existe el job `archive-commercial-visits` en `cron.job` (ambas consultas de SQL Editor devolvieron `No rows returned`). El cron de purga exitoso observado anteriormente pertenece solo a ensayo. No publicar el código de Visitas/sucursales antes de instalar y verificar sus dependencias de base en producción.

## Preparación del PR (sin desplegar producción)

- Verificación local: `pnpm exec vitest run` pasó (110 archivos, 607 tests), `pnpm build` pasó y `pnpm lint` pasó después de corregir el formato de `public/offline.html`; `git diff --check` no encontró errores. El typecheck independiente `pnpm exec tsc --noEmit` todavía falla por el error previo `TS2737` de BigInt en `services/accounting/src/modules/treasury/__tests__/treasury-receivable-reopen.test.ts:65` (el build de Next sí pasa). No atribuir ese error a las nuevas pantallas.
- Para abrir un PR, incluir explícitamente los archivos nuevos sin seguimiento de Visitas, sucursales, cotizaciones y sus seis migraciones junto con los archivos modificados. Revisar el diff completo antes de preparar el commit; no usar `db push` para verificarlo. La apertura del PR no aplica migraciones ni activa nuevas funciones en producción.
- Validaciones de aceptación aún pendientes: PDF descargado desde la app instalada; vínculos con documentos reales y aprobación/herencia de preventa; prueba adversarial de despacho parcial/cuentas a cobrar; purga GPS efectiva al superar 30 días (sin borrar visitas/vínculos); flujo completo en dispositivos. Estas limitaciones deben quedar visibles en la descripción del PR y en el plan de habilitación, sin presentarlas como pruebas ya superadas.
- Ensayo y producción tienen historiales y esquemas distintos. Esto **no impide abrir el PR para revisión**, pero sí impide publicar la app nueva o habilitar sus funciones en producción sin un despliegue de base separado, controlado y verificado.
