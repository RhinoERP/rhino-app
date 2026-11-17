-- Restore RPCs absent from installations that already have the human inbox release.
-- Definitions match their original migrations; existing control/outbox RPCs are untouched.
CREATE OR REPLACE FUNCTION public.finish_whatsapp_agent_job(
  p_job_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_error text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT 0
)
RETURNS public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.agent_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job
  FROM public.agent_jobs
  WHERE id = p_job_id
    AND status = 'PROCESSING'
    AND locked_by = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El trabajo no está reclamado por este worker';
  END IF;

  IF p_succeeded THEN
    UPDATE public.agent_jobs
    SET status = 'SUCCEEDED', completed_at = now(), locked_at = NULL, locked_by = NULL
    WHERE id = v_job.id
    RETURNING * INTO v_job;
  ELSIF v_job.attempts >= v_job.max_attempts THEN
    UPDATE public.agent_jobs
    SET status = 'FAILED', completed_at = now(), last_error = left(coalesce(p_error, 'Error desconocido'), 2000),
        locked_at = NULL, locked_by = NULL
    WHERE id = v_job.id
    RETURNING * INTO v_job;
  ELSE
    UPDATE public.agent_jobs
    SET status = 'RETRY', available_at = now() + make_interval(secs => greatest(p_retry_after_seconds, 1)),
        last_error = left(coalesce(p_error, 'Error transitorio'), 2000), locked_at = NULL, locked_by = NULL
    WHERE id = v_job.id
    RETURNING * INTO v_job;
  END IF;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_whatsapp_agent_job(uuid, text, boolean, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_whatsapp_agent_job(uuid, text, boolean, text, integer) TO service_role;

-- Only the trusted commercial tools may request aggregate purchase evidence.
-- No customer identities or cross-organization statistics are returned.
CREATE OR REPLACE FUNCTION public.whatsapp_product_recommendations(
  p_organization_id uuid,
  p_query text DEFAULT NULL,
  p_related_product_id uuid DEFAULT NULL
)
RETURNS TABLE(product_id uuid, order_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT i.product_id, count(DISTINCT s.id) AS order_count
  FROM sales_orders s
  JOIN sales_order_items i ON i.sales_order_id = s.id
    AND i.organization_id = p_organization_id
  JOIN products p ON p.id = i.product_id
    AND p.organization_id = p_organization_id AND p.is_active
  LEFT JOIN categories c ON c.id = p.category_id AND c.organization_id = p_organization_id
  WHERE s.organization_id = p_organization_id
    AND s.status IN ('CONFIRMED', 'DISPATCH', 'DELIVERED')
    AND s.sale_date >= current_date - 90
    AND s.sale_date <= current_date
    AND coalesce(s.observations, '') NOT ILIKE '%[SIMULACIÓN LOCAL]%'
    AND NOT EXISTS (
      SELECT 1 FROM whatsapp_conversations c
      JOIN whatsapp_integrations wi ON wi.id = c.integration_id
      WHERE c.id = s.conversation_id
        AND wi.phone_number_id LIKE 'rhinos-local-simulator:%'
    )
    AND (p_query IS NULL OR NOT EXISTS (
      SELECT 1 FROM regexp_split_to_table(lower(trim(p_query)), '\s+') term
      WHERE term <> '' AND position(
        translate(term, 'áéíóúü', 'aeiouu') IN
        translate(lower(concat_ws(' ', p.name, p.brand, p.description, c.name)), 'áéíóúü', 'aeiouu')
      ) = 0
    ))
    AND (i.quantity > 0 OR i.unit_quantity > 0)
    AND (p_related_product_id IS NULL OR (
      i.product_id <> p_related_product_id AND EXISTS (
        SELECT 1 FROM sales_order_items related
        JOIN products rp ON rp.id = related.product_id
          AND rp.organization_id = p_organization_id AND rp.is_active
        WHERE related.sales_order_id = s.id
          AND related.organization_id = p_organization_id
          AND related.product_id = p_related_product_id
          AND (related.quantity > 0 OR related.unit_quantity > 0)
      )
    ))
  GROUP BY i.product_id
  ORDER BY order_count DESC, i.product_id
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_product_recommendations(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_product_recommendations(uuid, text, uuid) TO service_role;
