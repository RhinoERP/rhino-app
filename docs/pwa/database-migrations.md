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

La aplicacion de la migracion y una creacion completa mediante el endpoint estan confirmadas. Todavia faltan verificaciones directas de grants, rollback forzado y concurrencia contra PostgreSQL real.
