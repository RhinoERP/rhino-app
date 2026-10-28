-- The item-discount migration recreated this function with the old IN_TRANSIT-only
-- guard, undoing the PARTIALLY_RECEIVED support from the partial-receipts migration.
-- Change only that guard, retaining the currently deployed fiscal and discount logic.
DO $migration$
DECLARE
  v_definition text;
  v_old_guard constant text :=
    'p_mode in (''receipt'', ''receipt_legacy'') and v_order.status <> ''IN_TRANSIT''';
  v_new_guard constant text :=
    'p_mode in (''receipt'', ''receipt_legacy'') and v_order.status not in (''IN_TRANSIT'', ''PARTIALLY_RECEIVED'')';
  v_old_count integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'persist_purchase_fiscal_state'
    AND p.pronargs = 18;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Falta persist_purchase_fiscal_state';
  END IF;

  v_old_count :=
    (length(v_definition) - length(replace(v_definition, v_old_guard, '')))
    / length(v_old_guard);
  IF v_old_count = 0 AND position(v_new_guard IN v_definition) > 0 THEN
    RETURN; -- Already fixed.
  END IF;
  IF v_old_count <> 1 OR position(v_new_guard IN v_definition) > 0 THEN
    RAISE EXCEPTION 'No se pudo identificar una única condición de estado de recepción';
  END IF;

  EXECUTE replace(v_definition, v_old_guard, v_new_guard);
END;
$migration$;
