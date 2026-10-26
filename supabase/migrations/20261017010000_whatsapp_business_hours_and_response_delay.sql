ALTER TABLE public.whatsapp_integrations
  ADD COLUMN IF NOT EXISTS response_delay_min_minutes integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS response_delay_max_minutes integer NOT NULL DEFAULT 3;

ALTER TABLE public.whatsapp_integrations
  DROP CONSTRAINT IF EXISTS whatsapp_integrations_response_delay_range_check;
ALTER TABLE public.whatsapp_integrations
  ADD CONSTRAINT whatsapp_integrations_response_delay_range_check CHECK (
    response_delay_min_minutes BETWEEN 0 AND 120
    AND response_delay_max_minutes BETWEEN response_delay_min_minutes AND 120
  );

ALTER TABLE public.agent_jobs
  ADD COLUMN IF NOT EXISTS human_delay_applied boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.defer_whatsapp_agent_job(
  p_job_id uuid,
  p_worker_id text,
  p_available_at timestamptz
)
RETURNS public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.agent_jobs%ROWTYPE;
BEGIN
  IF p_available_at <= now() THEN
    RAISE EXCEPTION 'La fecha de reanudación debe ser futura';
  END IF;

  UPDATE public.agent_jobs
  SET status = 'RETRY',
      available_at = p_available_at,
      attempts = CASE
        WHEN human_delay_applied THEN attempts
        ELSE greatest(attempts - 1, 0)
      END,
      human_delay_applied = true,
      locked_at = NULL,
      locked_by = NULL
  WHERE id = p_job_id
    AND status = 'PROCESSING'
    AND locked_by = p_worker_id
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El trabajo no está bloqueado por este worker o ya fue diferido';
  END IF;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.defer_whatsapp_agent_job(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.defer_whatsapp_agent_job(uuid, text, timestamptz) TO service_role;
