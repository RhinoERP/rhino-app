-- Add replaced_by_list_id to track which list replaced this one.
-- A list with this field set is considered "Inactive" (replaced but still
-- valid for existing customer assignments).
ALTER TABLE price_lists
  ADD COLUMN IF NOT EXISTS replaced_by_list_id uuid REFERENCES price_lists(id);

-- Transactional RPC: marks old list as replaced and migrates all
-- customer_supplier_assignments within the org to point to the new list.
CREATE OR REPLACE FUNCTION replace_price_list(
  p_old_list_id uuid,
  p_new_list_id uuid,
  p_organization_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Migrate assignments atomically
  UPDATE customer_supplier_assignments
  SET
    price_list_id = p_new_list_id,
    updated_at    = now()
  WHERE price_list_id    = p_old_list_id
    AND organization_id  = p_organization_id;

  -- Mark old list as replaced
  UPDATE price_lists
  SET replaced_by_list_id = p_new_list_id
  WHERE id = p_old_list_id;
END;
$$;
