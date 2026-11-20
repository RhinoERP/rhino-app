# Migraciones de base para comandos offline

## Migracion vigente

`supabase/migrations/20260921120000_harden_offline_pre_sale_replay.sql` es una migracion aditiva de hardening. No debe reemplazarse editando migraciones ya aplicadas.

Incluye:

- `get_offline_pre_sale_replay_result(jsonb)`, disponible para `authenticated` y basada en `auth.uid()`;
- verificacion de propietario, organizacion, hash y finalizacion antes de devolver un replay;
- `create_offline_pre_sale_atomic(uuid,jsonb)`, cuya firma recibe el actor verificado por el servidor;
- revocacion de las firmas atomicas a `public`, `anon` y `authenticated`;
- permiso de ejecucion de la firma nueva exclusivamente para `service_role`.

La RPC atomica vuelve a comprobar membresia activa, organizacion habilitada, referencias y limites antes de persistir. La autorizacion principal y la comparacion comercial fresca ocurren previamente en el endpoint con sesion; service role no debe exponerse al navegador.

## Aplicacion y verificacion

La migracion `20260921120000_harden_offline_pre_sale_replay.sql` fue aplicada al entorno del piloto. Desde una PWA instalada en iOS, el endpoint completo sincronizo una preventa y creo la venta sin errores visibles.

Aplicar migraciones con el proceso normal del entorno. Despues verificar en una base no productiva:

1. `authenticated` puede consultar solo su replay completado.
2. `anon` y `authenticated` no pueden ejecutar `create_offline_pre_sale_atomic(uuid,jsonb)`.
3. El endpoint puede crear una preventa mediante service role despues de validar la sesion.
4. Repetir el mismo comando devuelve el mismo `sales_order_id`; cambiar el payload para igual ID falla.
5. Un error de items o impuestos revierte orden y reclamo.

La migracion y una creacion completa mediante el endpoint estan confirmadas en el entorno piloto. Todavia faltan verificaciones directas de grants, rollback forzado, respuesta perdida y concurrencia contra PostgreSQL real.

## Verificación de solo lectura en ensayo (2026-11-19)

- Con una sesión de vendedor, `get_offline_pre_sale_replay_result(jsonb)` devolvió una lista vacía para un ID de comando inexistente (sin escrituras).
- Sin sesión, la misma RPC devolvió inicialmente `OFFLINE_AUTH_REQUIRED` desde el cuerpo de la función: el control interno protegía los datos, pero `anon` podía ejecutar la RPC. El usuario **aplicó en ensayo mediante SQL Editor** `20261119000000_revoke_anonymous_offline_replay_lookup.sql` el 19/11. Una nueva prueba con la clave pública devolvió `permission denied for function`, y la consulta de metadatos mostró `anon_execute = false` y `authenticated_execute = true`. **No volver a aplicar** la migración; conciliar el historial de Supabase CLI antes de un futuro `db push` (no se ejecutó ningún `migration repair`).
- No se llamaron las RPC atómicas de escritura para probar sus permisos. Las consultas de metadatos realizadas por el usuario en SQL Editor de **ensayo** mostraron `anon_execute = false`, `authenticated_execute = false` y `service_role_execute = true` para ambas firmas de `create_offline_pre_sale_atomic` y las funciones privilegiadas de cotización. El cron `archive-commercial-visits` está activo y sus cinco últimas ejecuciones (hasta el 19/11) finalizaron con `succeeded`. Esto verifica instalación y ejecución, no la purga efectiva: en LuchoBet ninguna de las seis visitas tenía más de 30 días.

Consultas de **solo lectura** para completar la comprobación en SQL Editor:

```sql
select p.oid::regprocedure::text as signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_offline_pre_sale_replay_result',
    'create_offline_pre_sale_atomic', 'create_sales_quote_request_idempotent',
    'create_sales_quote_request_with_day', 'commercial_site_catalog',
    'archive_commercial_visits')
order by signature;

select jobid, jobname, schedule, command, active
from cron.job where jobname = 'archive-commercial-visits';

select status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'archive-commercial-visits')
order by start_time desc limit 5;

-- Si se aplicaron migraciones desde SQL Editor, comprobar sin modificarlas
-- si Supabase CLI las reconoce antes de usar db push:
select version from supabase_migrations.schema_migrations
where version in ('20260921120000', '20261112000000', '20261112010000',
  '20261112020000', '20261117000000', '20261118000000', '20261119000000')
order by version;
```

Confirmado en ensayo **después** de aplicar la migración nueva: `anon_execute = false` y `authenticated_execute = true` para el lookup; la RPC atómica con actor solo puede ser ejecutada por `service_role`. El cron está activo y llama `public.archive_commercial_visits()` todos los días a las 03:15 UTC; ninguna prueba de lectura demuestra por sí sola la purga real de coordenadas a los 30 días.

**Historial de CLI (19/11, SQL Editor de ensayo):** la consulta de las siete versiones anteriores devolvió `Success. No rows returned`. No ejecutar `db push` ni `migration repair` a ciegas: la versión `20260921120000` está duplicada en el repositorio (`harden_offline_pre_sale_replay` y `add_informal_advance_to_sales_orders`). Se confirmó por lectura que existe la columna `sales_orders.advance_payment_percentage` y que la RPC de replay funciona, pero una versión compartida no permite distinguir la aplicación de ambos archivos. Hay otras versiones duplicadas en el árbol. Consultar primero el historial completo de `supabase_migrations.schema_migrations` y planificar una conciliación que no reejecute SQL ni marque como aplicados cambios ausentes.

**Historial completo de ensayo, confirmado por el usuario:** el SQL Editor devolvió 12 entradas y la última registrada es `20261110000000_sales_quote_request_idempotency`. El árbol local contiene 141 archivos SQL, 125 versiones distintas y 15 versiones duplicadas. Los seis archivos posteriores a `20261110000000` corresponden a Visitas, sucursales y la revocación del lookup ya aplicadas manualmente en ensayo; no aparecen en el historial. Registrar solo esas seis no vuelve seguro `db push`, porque también hay numerosos archivos anteriores sin registro (incluidos duplicados). Mantener el despliegue SQL manual y revisado hasta definir una reconciliación integral por entorno; **no reparar ni empujar el historial en bloque**.

## Revisión de producción configurada en `.env.prod` (solo lectura, 2026-11-19)

Se confirmó que `.env.prod` apunta a otro proyecto que ensayo. Consultas GET vacías (`limit 0`, sin leer registros comerciales) devolvieron `PGRST205` para `commercial_visits`, `commercial_routes`, `customer_sites`, `commercial_visit_documents`, `commercial_location_proposals`, `sales_quote_requests` y `sales_quote_request_idempotency`. En ensayo las dos tablas de cotizaciones respondieron `200` con el mismo tipo de consulta. Las columnas `sales_orders.delivery_site_*` devolvieron `42703` y las RPC de sucursales `PGRST202`. El lookup anónimo de replay devolvió `OFFLINE_AUTH_REQUIRED` desde el cuerpo de la función: a diferencia de ensayo, el acceso anónimo a su ejecución aún no está revocado. **No desplegar el código nuevo sobre esta base** hasta confirmar la situación con SQL Editor y completar el despliegue de base revisado. No se ejecutaron funciones de escritura, migraciones ni `db push` en producción.

**Procedencia confirmada por el usuario:** todos los resultados de SQL Editor compartidos hasta ese momento, incluido el historial de 12 versiones, los grants y las ejecuciones del cron, provenían de **ensayo** (`.env.local`). No se ejecutaron las migraciones de este trabajo en el proyecto de `.env.prod`. La lectura de la API de `.env.prod` es independiente y no autoriza inferir su historial de migraciones, grants o cron. Antes de planificar SQL productivo, confirmar el proyecto destino y consultar su esquema real, permisos, cron e historial en su propio SQL Editor. No desplegar código nuevo ni usar `db push`/`migration repair`.

**Primera consulta de SQL Editor productivo, compartida después de solicitar elegir el proyecto de `.env.prod`:** `to_regclass` devolvió `NULL` para `sales_quote_requests`, `sales_quote_request_idempotency`, `commercial_visits`, `commercial_routes`, `customer_sites`, `commercial_visit_documents` y `commercial_location_proposals`; `to_regprocedure('public.commercial_site_catalog(uuid,uuid)')` también devolvió `NULL`. Esto corrobora directamente la ausencia de esos objetos en la base consultada, sin depender de la caché de PostgREST. `to_regclass('cron.job')` devolvió `cron.job`: existe la tabla de pg_cron, **no se verificó que esté programado `archive-commercial-visits`**. Siguen pendientes el historial, las columnas `sales_orders.delivery_site_%`, los grants y el job en producción. No se aplicó SQL de escritura.

**Grants confirmados por el usuario en SQL Editor de producción:** las dos firmas de `create_offline_pre_sale_atomic` tienen `EXECUTE` solo para `service_role`; `get_offline_pre_sale_replay_result(jsonb)` lo tiene para `anon`, `authenticated` y `service_role`. El permiso anónimo coincide con la respuesta `OFFLINE_AUTH_REQUIRED` observada en la API de `.env.prod` y difiere de ensayo después de la revocación. La denegación dentro de la función no reemplaza la revocación del permiso de ejecución; programar la migración `20261119000000` como parte de un despliegue productivo revisado, sin reejecutarla en ensayo.

**Historial de producción, SQL Editor confirmado por el usuario:** la consulta de las 15 versiones más recientes mostró un historial diferente del de ensayo. La última registrada es `20261117133042_restore_whatsapp_missing_rpcs` y le sigue `20261110013135_whatsapp_human_inbox_release`; las restantes del resultado corresponden a migraciones anteriores de abril de 2026. Por tanto, la afirmación del usuario de que no se ejecutaron migraciones en producción se refiere a **las de este trabajo**, no a que producción carezca de historial. Las 12 versiones hasta `20261110000000_sales_quote_request_idempotency` compartidas antes son **de ensayo**. No usar ninguno de estos historiales como prueba de instalación de archivos concretos sin comprobar objetos y dependencias. No se aplicó SQL de escritura.

**Columnas y cron productivos, SQL Editor:** la consulta a `information_schema.columns` con `table_name = 'sales_orders'` y `column_name like 'delivery_site_%'` devolvió `Success. No rows returned`: faltan los snapshots de destino de entrega (además de las tablas y RPC consultadas). La consulta a `cron.job` filtrada por `jobname = 'archive-commercial-visits'` también devolvió `Success. No rows returned`: **no existe el job de purga** en producción, aunque la tabla `cron.job` sí existe.

**Conclusión de esta revisión (solo lectura):** producción no está lista para recibir la app nueva de PWA, cotizaciones offline, Visitas y sucursales. Ensayo tiene objetos y cron que producción no tiene; además, en producción `anon` aún puede ejecutar el lookup de replay. Para preparar un despliegue seguro se requiere revisar dependencias y estado efectivo de la base productiva, preparar SQL específico y ordenado para este entorno, verificar permisos y cron, y recién después desplegar el código. No usar `db push` ni `migration repair` sobre los historiales divergentes. No se modificaron datos ni esquema productivos durante la revisión.

Una consulta `HEAD` previa informó `error = null` incluso cuando el HTTP era `404`; **no utilizar HEAD como prueba de existencia** para esta API. La comprobación anterior se corrigió con GET vacío. Este archivo local `.env.prod` tampoco declara las claves de firma/cifrado offline; puede no reflejar las variables efectivas del despliegue y deben verificarse allí **sin compartir sus valores**.
