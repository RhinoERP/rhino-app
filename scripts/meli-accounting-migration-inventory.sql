-- Read-only inventory of selected Meli migration objects.
-- Run against each identified destination separately. This does not prove that
-- a migration completed, that its definition is current, or that it is safe to
-- replay. Compare migration history, definitions, grants and prerequisites.
WITH expected(destination, migration, kind, schema_name, object_name, parent_name) AS (
  VALUES
    ('supabase', '20261121190000', 'table', 'public', 'mercadolibre_accounting_breakdown_drafts', NULL),
    ('supabase', '20261121190000', 'function', 'public', 'assert_meli_accounting_access', NULL),
    ('supabase', '20261121190000', 'function', 'public', 'save_meli_accounting_breakdown_draft', NULL),
    ('supabase', '20261121190000', 'function', 'public', 'list_meli_accounting_breakdown_drafts', NULL),
    ('supabase', '20261121210000', 'table', 'public', 'mercadolibre_accounting_payment_preparations', NULL),
    ('supabase', '20261121210000', 'table', 'public', 'mercadolibre_accounting_payment_preparation_components', NULL),
    ('supabase', '20261121210000', 'function', 'public', 'prepare_meli_accounting_payment', NULL),
    ('supabase', '20261121210000', 'function', 'public', 'cancel_meli_accounting_payment_preparation', NULL),
    ('supabase', '20261121210000', 'trigger', 'public', 'meli_prepared_payment_void_guard', 'mercadolibre_payments'),
    ('supabase', '20261122220000', 'table', 'public', 'mercadolibre_accounting_payment_dispatches', NULL),
    ('supabase', '20261122220000', 'function', 'public', 'begin_meli_payment_dispatch', NULL),
    ('supabase', '20261122220000', 'function', 'public', 'confirm_meli_payment_dispatch', NULL),
    ('supabase', '20261122220000', 'trigger', 'public', 'meli_dispatched_preparation_cancel_guard', 'mercadolibre_accounting_payment_preparations'),
    ('supabase', '20261123010000', 'function', 'public', 'list_meli_payment_accounting_preparations', NULL),
    ('supabase', '20261123020000', 'function', 'public', 'get_meli_payment_dispatch_for_recovery', NULL),
    ('supabase', '20261123030000', 'function', 'public', 'get_meli_payment_dispatch_source', NULL),
    ('supabase', '20261123040000', 'table', 'public', 'mercadolibre_fiscal_accounting_preparations', NULL),
    ('supabase', '20261123040000', 'function', 'public', 'prepare_meli_fiscal_accounting', NULL),
    ('supabase', '20261123040000', 'function', 'public', 'get_meli_fiscal_accounting_preparation', NULL),
    ('supabase', '20261123050000', 'table', 'public', 'mercadolibre_fiscal_accounting_dispatches', NULL),
    ('supabase', '20261123050000', 'function', 'public', 'begin_meli_fiscal_dispatch', NULL),
    ('supabase', '20261123050000', 'function', 'public', 'confirm_meli_fiscal_dispatch', NULL),
    ('supabase', '20261123050000', 'function', 'public', 'get_meli_fiscal_dispatch_for_recovery', NULL),
    ('supabase', '20261123060000', 'table', 'public', 'mercadolibre_payment_reversal_reservations', NULL),
    ('supabase', '20261123060000', 'table', 'public', 'mercadolibre_payment_reversal_components', NULL),
    ('supabase', '20261123060000', 'function', 'public', 'reserve_meli_payment_reversal', NULL),
    ('supabase', '20261123060000', 'function', 'public', 'confirm_meli_payment_reversal_component', NULL),
    ('supabase', '20261123060000', 'function', 'public', 'finalize_meli_payment_reversal', NULL),
    ('supabase', '20261123060000', 'function', 'public', 'get_meli_payment_reversal_reservation', NULL),
    ('supabase', '20261123060000', 'trigger', 'public', 'meli_reversal_dispatch_guard', 'mercadolibre_accounting_payment_dispatches'),
    ('supabase', '20261123090000', 'grant', 'public', 'begin_meli_payment_dispatch', '(uuid, uuid, uuid, text, uuid, jsonb)'),
    ('supabase', '20261123090000', 'grant', 'public', 'confirm_meli_payment_dispatch', '(uuid, uuid, uuid, text, uuid, jsonb, uuid)'),
    ('supabase', '20261123090000', 'grant', 'public', 'begin_meli_fiscal_dispatch', '(uuid, uuid, uuid, jsonb)'),
    ('supabase', '20261123090000', 'grant', 'public', 'confirm_meli_fiscal_dispatch', '(uuid, uuid, uuid, uuid, jsonb, uuid)'),
    ('supabase', '20261123090000', 'grant', 'public', 'reserve_meli_payment_reversal', '(uuid, uuid, uuid, uuid, uuid, date, text)'),
    ('supabase', '20261123090000', 'grant', 'public', 'confirm_meli_payment_reversal_component', '(uuid, uuid, uuid, uuid, text, uuid, uuid)'),
    ('supabase', '20261123090000', 'grant', 'public', 'finalize_meli_payment_reversal', '(uuid, uuid, uuid, uuid)'),
    ('supabase', '20261123070000', 'function', 'public', 'assert_meli_sale_dispatch_capacity', NULL),
    ('supabase', '20261123070000', 'trigger', 'public', 'meli_fiscal_dispatch_capacity_guard', 'mercadolibre_fiscal_accounting_dispatches'),
    ('supabase', '20261123070000', 'trigger', 'public', 'meli_payment_dispatch_capacity_guard', 'mercadolibre_accounting_payment_dispatches'),
    ('supabase', '20261123080000', 'function', 'public', 'get_meli_sale_accounting_review', NULL),
    ('accounting', '024', 'table', 'accounting', 'meli_payment_reversals', NULL),
    ('accounting', '024', 'function', 'accounting', 'reverse_meli_payment_entry', NULL),
    ('accounting', '025', 'table', 'accounting', 'meli_journal_requests', NULL),
    ('accounting', '025', 'function', 'accounting', 'create_meli_journal_entry', NULL),
    ('accounting', '026', 'function', 'accounting', 'find_meli_journal_request', NULL),
    ('accounting', '027', 'function', 'accounting', 'find_meli_payment_reversal', NULL),
    ('accounting', '027', 'trigger', 'accounting', 'meli_payment_contra_entry_guard', 'journal_entries'),
    ('accounting', '028', 'table', 'accounting', 'meli_posting_periods', NULL),
    ('accounting', '028', 'trigger', 'accounting', 'meli_posting_period_guard', 'journal_entries'),
    ('accounting', '029', 'table', 'accounting', 'meli_posting_period_changes', NULL),
    ('accounting', '029', 'function', 'accounting', 'change_meli_posting_period', NULL),
    ('accounting', '030', 'function', 'accounting', 'verify_meli_payment_reversal_source', NULL),
    ('accounting', '030', 'function', 'accounting', 'reverse_verified_meli_payment', NULL),
    ('accounting', '031', 'trigger', 'accounting', 'a_meli_journal_creation_guard', 'journal_entries'),
    ('accounting', '031', 'trigger', 'accounting', 'linked_meli_journal_entry_guard', 'journal_entries'),
    ('accounting', '031', 'trigger', 'accounting', 'linked_meli_journal_line_guard', 'journal_entry_lines'),
    ('accounting', '031', 'trigger', 'accounting', 'meli_journal_request_immutable', 'meli_journal_requests'),
    ('accounting', '031', 'trigger', 'accounting', 'meli_payment_reversal_immutable', 'meli_payment_reversals'),
    ('accounting', '031', 'trigger', 'accounting', 'meli_fiscal_contra_entry_guard', 'journal_entries'),
    ('accounting', '032', 'function', 'accounting', 'seed_meli_test_chart', NULL),
    ('accounting', '033', 'function', 'accounting', 'lock_meli_source_write', NULL),
    ('accounting', '033', 'trigger', 'accounting', 'b_meli_source_write_fence', 'journal_entries')
)
SELECT current_database() AS database_name, e.destination, e.migration, e.kind,
  e.schema_name, e.object_name, e.parent_name,
  CASE e.kind
    WHEN 'table' THEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = e.schema_name AND c.relname = e.object_name
        AND c.relkind IN ('r', 'p')
    )
    WHEN 'function' THEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = e.schema_name AND p.proname = e.object_name
        AND p.prokind = 'f'
    )
    WHEN 'grant' THEN coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          e.schema_name || '.' || e.object_name || e.parent_name
        ),
        'EXECUTE'
      ),
      false
    )
    WHEN 'trigger' THEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = e.schema_name AND c.relname = e.parent_name
        AND t.tgname = e.object_name AND NOT t.tgisinternal
    )
  END AS present,
  CASE WHEN e.kind = 'trigger' THEN (
    SELECT t.tgenabled::text
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = e.schema_name AND c.relname = e.parent_name
      AND t.tgname = e.object_name AND NOT t.tgisinternal
  ) END AS trigger_mode
FROM expected e
ORDER BY e.destination, e.migration, e.kind, e.object_name;
