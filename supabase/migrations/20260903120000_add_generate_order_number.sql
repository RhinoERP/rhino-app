-- Numeración atómica de pedidos por organización.
--
-- Reemplaza la generación COUNT-based (`count(*) de orders del año + 1`) que
-- chocaba con el unique constraint `orders_organization_id_number_key` cuando
-- se borraban/cancelaban pedidos (el conteo baja pero quedan números mayores).
--
-- Sigue el mismo patrón que `generate_remittance_number`: bloquea la fila de
-- `organizations` con `FOR UPDATE` para evitar race conditions.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS orders_last_number bigint NOT NULL DEFAULT 0;

-- Backfill: deja el contador en el máximo número principal existente por org.
-- Se excluyen los sub-pedidos (formato `ORD-YYYY-0009-UUi2`) con el regex anclado.
UPDATE organizations o
SET orders_last_number = COALESCE(
  (
    SELECT MAX(NULLIF(substring(x.order_number FROM '^ORD-[0-9]{4}-([0-9]+)'), '')::bigint)
    FROM orders x
    WHERE x.organization_id = o.id
      AND x.order_number ~ '^ORD-[0-9]{4}-[0-9]+$'
  ),
  0
);

CREATE OR REPLACE FUNCTION public.generate_order_number(p_org_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  SELECT orders_last_number + 1 INTO v_next
  FROM organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Organización no encontrada';
  END IF;

  UPDATE organizations
  SET orders_last_number = v_next
  WHERE id = p_org_id;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid) TO authenticated, service_role;