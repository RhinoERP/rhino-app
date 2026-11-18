-- Preserve the original validated user intent independently of prices, tax
-- configuration and lot availability recomputed while retrying a request.
BEGIN;

ALTER FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb)
  RENAME TO commit_mercadolibre_sale_internal;
REVOKE ALL ON FUNCTION public.commit_mercadolibre_sale_internal(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.commit_mercadolibre_sale(
  p_org_id uuid, p_actor_id uuid, p_idempotency_key uuid, p_payload jsonb
) RETURNS TABLE (sale_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_member public.organization_members%ROWTYPE;
  v_sale public.sales_orders%ROWTYPE;
  v_admin boolean;
  v_input_fingerprint text;
  v_result record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'La confirmación Meli requiere el servicio autorizado' USING ERRCODE = '42501';
  END IF;
  v_input_fingerprint := p_payload->>'input_fingerprint';
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_idempotency_key IS NULL
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR v_input_fingerprint IS NULL OR v_input_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Falta la identidad de la solicitud comercial';
  END IF;
  SELECT * INTO v_member FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = p_actor_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;
  v_admin := v_member.is_owner OR EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.id = v_member.role_id AND r.organization_id = p_org_id AND p.key = 'organization.admin'
  );
  IF NOT v_admin AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.id = v_member.role_id AND r.organization_id = p_org_id AND p.key = 'mercadolibre.manage'
  ) THEN RAISE EXCEPTION 'Sin permiso para registrar ventas Meli' USING ERRCODE = '42501'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-sale:' || p_org_id::text || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO v_sale FROM public.sales_orders
    WHERE organization_id = p_org_id AND sales_channel = 'MERCADO_LIBRE'
      AND marketplace_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_sale.user_id IS DISTINCT FROM p_actor_id OR
      v_sale.commercial_snapshot->>'meli_input_fingerprint' IS DISTINCT FROM v_input_fingerprint THEN
      RAISE EXCEPTION 'La clave de confirmación ya corresponde a otra solicitud';
    END IF;
    IF NOT v_admin THEN
      PERFORM 1 FROM public.warehouse_user_assignments
        WHERE organization_id = p_org_id AND warehouse_id = v_sale.warehouse_id
          AND user_id = p_actor_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501'; END IF;
    END IF;
    RETURN QUERY SELECT v_sale.id, true;
    RETURN;
  END IF;

  SELECT * INTO STRICT v_result FROM public.commit_mercadolibre_sale_internal(
    p_org_id, p_actor_id, p_idempotency_key, p_payload
  );
  UPDATE public.sales_orders
    SET commercial_snapshot = coalesce(commercial_snapshot, '{}'::jsonb)
      || jsonb_build_object('meli_input_fingerprint', v_input_fingerprint)
    WHERE id = v_result.sale_id AND organization_id = p_org_id;
  RETURN QUERY SELECT v_result.sale_id::uuid, v_result.idempotent::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb) TO service_role;

COMMIT;
