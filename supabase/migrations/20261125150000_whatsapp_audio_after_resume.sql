-- Audio before the last return to automation cannot be reclaimed and
-- therefore must not block jobs from the current automation period.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_job_v2(p_worker_id text,p_job_type text,p_execution_mode text DEFAULT 'DAEMON',p_job_id uuid DEFAULT null,p_capacity integer DEFAULT 8)
RETURNS SETOF public.agent_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  j agent_jobs%ROWTYPE;
  v_resumed_at timestamptz;
BEGIN
  IF coalesce(btrim(p_worker_id),'')='' OR p_job_type NOT IN ('TRANSCRIBE_AUDIO','PROCESS_CONVERSATION') OR p_execution_mode NOT IN ('INLINE','DAEMON') THEN RAISE EXCEPTION 'Configuración de worker inválida'; END IF;
  -- Serialize admission briefly; no database transaction spans a provider request.
  PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp-claim-'||p_job_type,0));
  IF (SELECT count(*) FROM agent_jobs WHERE job_type=p_job_type AND status='PROCESSING' AND lease_expires_at>clock_timestamp()) >= greatest(1,least(p_capacity,32)) THEN RETURN; END IF;
  FOR j IN SELECT q.* FROM agent_jobs q
    JOIN whatsapp_integrations wi ON wi.id=q.integration_id AND wi.organization_id=q.organization_id
    JOIN whatsapp_conversations c ON c.id=q.conversation_id AND c.organization_id=q.organization_id
    JOIN organizations o ON o.id=q.organization_id
    WHERE q.job_type=p_job_type AND q.execution_mode=p_execution_mode AND (p_job_id IS NULL OR q.id=p_job_id)
      AND ((q.status IN ('PENDING','RETRY') AND q.available_at<=now()) OR (q.status='PROCESSING' AND q.lease_expires_at<=clock_timestamp()))
      AND o.is_active AND c.status='ACTIVE' AND c.human_claimed_at IS NULL
      AND (c.automation_resumed_at IS NULL OR (SELECT m.created_at FROM public.whatsapp_messages m WHERE m.id=q.source_message_id)>c.automation_resumed_at)
      AND public.is_whatsapp_mode_enabled(o.id,wi.phone_number_id)
      AND ((wi.phone_number_id LIKE 'rhinos-local-simulator:%' AND wi.status='DRAFT') OR wi.status='ACTIVE')
      AND (p_job_type<>'TRANSCRIBE_AUDIO' OR CASE WHEN wi.phone_number_id LIKE 'rhinos-local-simulator:%' THEN o.whatsapp_sandbox_audio_enabled ELSE o.whatsapp_audio_enabled END)
      AND NOT EXISTS(SELECT 1 FROM whatsapp_outbox x WHERE x.conversation_id=q.conversation_id AND (x.status='UNKNOWN' OR (x.status='SENDING' AND x.source_message_id<>q.source_message_id)))
      AND (p_job_type<>'TRANSCRIBE_AUDIO' OR NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets a WHERE a.message_id=q.source_message_id AND a.status<>'SUCCEEDED' AND a.expires_at<=clock_timestamp()))
      -- Filter blocked conversations before LIMIT: a busy chat must not hide
      -- eligible work for other tenants behind the first 50 candidates.
      AND (p_job_type<>'PROCESS_CONVERSATION' OR (
        NOT EXISTS(SELECT 1 FROM agent_jobs active WHERE active.conversation_id=q.conversation_id AND active.job_type='PROCESS_CONVERSATION' AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>q.id)
        AND NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets a JOIN whatsapp_messages m ON m.id=a.message_id JOIN whatsapp_messages src ON src.id=q.source_message_id
          WHERE a.conversation_id=q.conversation_id
            AND (m.created_at,m.id)<=(src.created_at,src.id)
            AND (c.automation_resumed_at IS NULL OR m.created_at>c.automation_resumed_at)
            AND a.status IN ('PENDING','PROCESSING'))
      ))
      AND NOT EXISTS(SELECT 1 FROM agent_jobs active WHERE active.organization_id=q.organization_id AND active.job_type=p_job_type AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>q.id GROUP BY active.organization_id HAVING count(*)>=2)
    ORDER BY q.available_at,q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 50
  LOOP
    IF p_job_type='PROCESS_CONVERSATION' THEN
      IF NOT pg_try_advisory_xact_lock(hashtextextended(j.conversation_id::text,0)) THEN CONTINUE; END IF;
      IF EXISTS(SELECT 1 FROM agent_jobs active WHERE active.conversation_id=j.conversation_id AND active.job_type='PROCESS_CONVERSATION' AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>j.id) THEN CONTINUE; END IF;
    END IF;
    -- The candidate query can predate a claim waiting on this same row.
    SELECT c.automation_resumed_at INTO v_resumed_at
      FROM public.whatsapp_conversations c JOIN public.whatsapp_messages m ON m.id=j.source_message_id
      WHERE c.id=j.conversation_id AND c.organization_id=j.organization_id AND c.status='ACTIVE'
        AND c.human_claimed_at IS NULL AND (c.automation_resumed_at IS NULL OR m.created_at>c.automation_resumed_at)
      FOR UPDATE OF c;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Ingestion also locks the conversation. Check audio again under that lock.
    IF p_job_type='PROCESS_CONVERSATION' AND EXISTS (
      SELECT 1 FROM whatsapp_audio_assets a
      JOIN whatsapp_messages m ON m.id=a.message_id
      JOIN whatsapp_messages src ON src.id=j.source_message_id
      WHERE a.conversation_id=j.conversation_id
        AND (m.created_at,m.id)<=(src.created_at,src.id)
        AND (v_resumed_at IS NULL OR m.created_at>v_resumed_at)
        AND a.status IN ('PENDING','PROCESSING')
    ) THEN CONTINUE; END IF;

    UPDATE agent_jobs SET status='PROCESSING',attempts=attempts+1,locked_at=now(),locked_by=p_worker_id,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '180 seconds',last_error=null WHERE id=j.id RETURNING * INTO j;
    RETURN NEXT j; RETURN;
  END LOOP;
END $$;

-- Retention and in-flight failures may still finalize old audio. Preserve
-- any order confirmation created since automation resumed.
CREATE OR REPLACE FUNCTION public.expire_whatsapp_audio_asset(p_message_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a whatsapp_audio_assets%ROWTYPE;
BEGIN
  PERFORM 1 FROM agent_jobs WHERE source_message_id=p_message_id AND job_type='TRANSCRIBE_AUDIO' FOR UPDATE;
  SELECT * INTO a FROM whatsapp_audio_assets WHERE message_id=p_message_id FOR UPDATE;
  IF NOT FOUND OR a.expires_at>clock_timestamp() OR a.purged_at IS NOT NULL THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM agent_jobs WHERE source_message_id=p_message_id AND status='PROCESSING' AND lease_expires_at>clock_timestamp()) THEN RETURN false; END IF;
  IF a.status<>'SUCCEEDED' THEN
    UPDATE whatsapp_conversations c SET pending_order_action=null
      FROM whatsapp_messages m
      WHERE c.id=a.conversation_id AND m.id=p_message_id
        AND (c.automation_resumed_at IS NULL OR m.created_at>c.automation_resumed_at);
    UPDATE whatsapp_audio_assets SET status='FAILED',error_code='AUDIO_EXPIRED',error_message='El audio venció. Pedile al cliente que lo reenvíe.' WHERE message_id=p_message_id;
    UPDATE agent_jobs SET status='FAILED',completed_at=now(),last_error='El audio venció.',locked_by=null,locked_at=null,lease_expires_at=null
      WHERE source_message_id=p_message_id AND job_type='TRANSCRIBE_AUDIO' AND status IN ('PENDING','RETRY','PROCESSING');
    UPDATE agent_jobs SET status='PENDING',available_at=now() WHERE source_message_id=p_message_id AND job_type='PROCESS_CONVERSATION' AND status='WAITING';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.finish_whatsapp_job_v2(p_job_id uuid,p_lease_token uuid,p_succeeded boolean,p_error text DEFAULT null,p_retryable boolean DEFAULT true,p_defer_until timestamptz DEFAULT null)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE; v_terminal boolean;
BEGIN
  SELECT * INTO j FROM agent_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='PROCESSING' AND lease_expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND OR j.lease_expires_at<=clock_timestamp() THEN RETURN false; END IF;
  v_terminal := NOT p_succeeded AND p_defer_until IS NULL AND (NOT p_retryable OR j.attempts>=j.max_attempts);
  UPDATE agent_jobs SET status=CASE WHEN p_defer_until IS NOT NULL THEN 'PENDING' WHEN p_succeeded THEN 'SUCCEEDED' WHEN v_terminal THEN 'FAILED' ELSE 'RETRY' END,
    available_at=coalesce(p_defer_until,now()+make_interval(secs=>least(300,5*power(2,least(j.attempts,6)-1))::integer)),
    attempts=CASE WHEN p_defer_until IS NOT NULL THEN greatest(0,attempts-1) ELSE attempts END,
    human_delay_applied=human_delay_applied OR p_defer_until IS NOT NULL,
    completed_at=CASE WHEN p_defer_until IS NULL AND (p_succeeded OR v_terminal) THEN now() ELSE null END,last_error=left(p_error,1000),locked_by=null,locked_at=null,lease_expires_at=null
    WHERE id=j.id;
  IF j.job_type='TRANSCRIBE_AUDIO' AND v_terminal AND NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets WHERE message_id=j.source_message_id AND status='SUCCEEDED') THEN
    UPDATE whatsapp_conversations c SET pending_order_action=null
      FROM whatsapp_messages m
      WHERE c.id=j.conversation_id AND m.id=j.source_message_id
        AND (c.automation_resumed_at IS NULL OR m.created_at>c.automation_resumed_at);
    UPDATE whatsapp_audio_assets SET status='FAILED',error_code='TRANSCRIPTION_FAILED',error_message=left(p_error,500),expires_at=now()+interval '24 hours' WHERE message_id=j.source_message_id AND status<>'SUCCEEDED';
    UPDATE agent_jobs SET status='PENDING',available_at=now() WHERE source_message_id=j.source_message_id AND job_type='PROCESS_CONVERSATION' AND status='WAITING';
  END IF;
  IF j.job_type='PROCESS_CONVERSATION' AND v_terminal THEN
    UPDATE whatsapp_outbox SET status='UNKNOWN',updated_at=now() WHERE source_message_id=j.source_message_id AND status='SENDING';
  END IF;
  RETURN true;
END $$;
