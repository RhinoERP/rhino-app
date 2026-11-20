-- Las tablas de multidepósito se crearon con permisos solo para
-- "authenticated". Los procesos del servidor (WhatsApp: agente de pedidos y
-- asistente del vendedor) usan service_role y fallaban con
-- "permission denied for table warehouses" al crear una preventa.
-- Se puede correr más de una vez sin error.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.warehouses,
  public.warehouse_user_assignments,
  public.stock_transfers,
  public.stock_transfer_items
TO service_role;
