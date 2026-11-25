-- Correctness fixes found during review. Safe to apply after the audio pipeline.
-- No flags are enabled and no historical messages or orders are removed.
ALTER TABLE public.whatsapp_audio_uploads ADD COLUMN IF NOT EXISTS cleanup_claimed_at timestamptz;
CREATE INDEX IF NOT EXISTS whatsapp_audio_assets_retention_idx ON public.whatsapp_audio_assets(expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS whatsapp_audio_uploads_retention_idx ON public.whatsapp_audio_uploads(expires_at) WHERE message_id IS NULL;
CREATE INDEX IF NOT EXISTS agent_jobs_claim_v2_idx ON public.agent_jobs(job_type,execution_mode,available_at,created_at) WHERE status IN ('PENDING','RETRY');
CREATE INDEX IF NOT EXISTS agent_jobs_active_lease_idx ON public.agent_jobs(job_type,lease_expires_at,organization_id,conversation_id) WHERE status='PROCESSING';
CREATE INDEX IF NOT EXISTS whatsapp_outbox_unresolved_idx ON public.whatsapp_outbox(conversation_id,source_message_id) WHERE status IN ('SENDING','UNKNOWN');
CREATE INDEX IF NOT EXISTS whatsapp_audio_assets_pending_idx ON public.whatsapp_audio_assets(conversation_id,message_id) WHERE status IN ('PENDING','PROCESSING');

CREATE TABLE IF NOT EXISTS public.whatsapp_audio_upload_daily_usage (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day date NOT NULL, upload_count integer NOT NULL CHECK(upload_count>=0),
  PRIMARY KEY(organization_id,day)
);
ALTER TABLE public.whatsapp_audio_upload_daily_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.whatsapp_audio_upload_daily_usage TO service_role;
INSERT INTO whatsapp_audio_upload_daily_usage(organization_id,day,upload_count)
SELECT organization_id,(created_at AT TIME ZONE 'UTC')::date,count(*) FROM whatsapp_audio_uploads
GROUP BY organization_id,(created_at AT TIME ZONE 'UTC')::date ON CONFLICT DO NOTHING;

-- Bound signed uploads too: provider quotas alone do not limit Storage costs.
CREATE OR REPLACE FUNCTION public.limit_whatsapp_audio_uploads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text||'-audio-uploads',0));
  IF EXISTS(SELECT 1 FROM whatsapp_audio_uploads WHERE id=NEW.id) THEN RETURN NEW; END IF;
  INSERT INTO whatsapp_audio_upload_daily_usage(organization_id,day,upload_count)
  VALUES(NEW.organization_id,(now() AT TIME ZONE 'UTC')::date,1)
  ON CONFLICT(organization_id,day) DO UPDATE SET upload_count=whatsapp_audio_upload_daily_usage.upload_count+1
  WHERE whatsapp_audio_upload_daily_usage.upload_count<100;
  IF NOT FOUND THEN
    RAISE SQLSTATE '54000' USING MESSAGE='Se alcanzó el límite diario de cargas de audio de esta organización';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS limit_whatsapp_audio_uploads ON public.whatsapp_audio_uploads;
CREATE TRIGGER limit_whatsapp_audio_uploads BEFORE INSERT ON public.whatsapp_audio_uploads FOR EACH ROW EXECUTE FUNCTION public.limit_whatsapp_audio_uploads();
REVOKE ALL ON FUNCTION public.limit_whatsapp_audio_uploads() FROM PUBLIC,anon,authenticated;

-- A pre-upgrade crash may leave PROCESSING rows without a lease. Recover them.
UPDATE public.agent_jobs SET status='RETRY',available_at=now(),locked_by=null,locked_at=null
WHERE status='PROCESSING' AND lease_expires_at IS NULL;

-- Keep this row lock until the caller's transaction commits. Check real time
-- after waiting on the conversation lock, rather than transaction-start now().
CREATE OR REPLACE FUNCTION public.lock_whatsapp_job_lease(p_job_id uuid,p_lease_token uuid,p_job_type text)
RETURNS public.agent_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agent_jobs WHERE id=p_job_id AND lease_token=p_lease_token
    AND job_type=p_job_type AND status='PROCESSING' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El trabajo perdió su exclusión'; END IF;
  PERFORM 1 FROM whatsapp_conversations WHERE id=j.conversation_id AND organization_id=j.organization_id FOR UPDATE;
  IF j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'El trabajo perdió su exclusión'; END IF;
  RETURN j;
END $$;

CREATE OR REPLACE FUNCTION public.mutate_whatsapp_order_leased(
  p_job_id uuid,p_lease_token uuid,p_organization_id uuid,p_integration_id uuid,
  p_conversation_id uuid,p_source_message_id uuid,p_operation text,
  p_cart_id uuid DEFAULT null,p_version integer DEFAULT null,p_payload jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE; result jsonb;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  IF (j.organization_id,j.integration_id,j.conversation_id,j.source_message_id)
    IS DISTINCT FROM (p_organization_id,p_integration_id,p_conversation_id,p_source_message_id) THEN
    RAISE EXCEPTION 'El trabajo no pertenece a esta conversación';
  END IF;
  -- Reuse the existing atomic source, tenant, cart, version and confirmation checks.
  result := public.mutate_whatsapp_order(p_organization_id,p_integration_id,p_conversation_id,
    p_source_message_id,CASE WHEN p_operation='HANDOFF' THEN 'CANCEL_ACTION' ELSE p_operation END,
    p_cart_id,p_version,p_payload);
  IF p_operation='HANDOFF' THEN
    UPDATE whatsapp_conversations SET status='HANDOFF',handoff_reason=left(p_payload->>'reason',1000),
      bot_paused_at=now(),assigned_user_id=(SELECT responsible_user_id FROM whatsapp_integrations WHERE id=j.integration_id)
    WHERE id=j.conversation_id;
    RETURN jsonb_build_object('handedOff',true);
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.validate_whatsapp_audio_asset(
  p_job_id uuid,p_lease_token uuid,p_mime_type text,p_byte_size integer,
  p_duration_seconds numeric,p_sha256 text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'TRANSCRIBE_AUDIO');
  UPDATE whatsapp_audio_assets SET stored=true,mime_type=p_mime_type,byte_size=p_byte_size,
    duration_seconds=p_duration_seconds,sha256=p_sha256,status='PROCESSING'
  WHERE message_id=j.source_message_id AND organization_id=j.organization_id
    AND status IN ('PENDING','PROCESSING') AND expires_at>clock_timestamp()
    AND (sha256 IS NULL OR sha256=p_sha256);
  RETURN FOUND;
END $$;

-- Expiration and worker admission coordinate through the transcription job lock.
-- The following Storage deletion is idempotent; failed deletions remain retryable.
CREATE OR REPLACE FUNCTION public.expire_whatsapp_audio_asset(p_message_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a whatsapp_audio_assets%ROWTYPE;
BEGIN
  PERFORM 1 FROM agent_jobs WHERE source_message_id=p_message_id AND job_type='TRANSCRIBE_AUDIO' FOR UPDATE;
  SELECT * INTO a FROM whatsapp_audio_assets WHERE message_id=p_message_id FOR UPDATE;
  IF NOT FOUND OR a.expires_at>clock_timestamp() OR a.purged_at IS NOT NULL THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM agent_jobs WHERE source_message_id=p_message_id AND status='PROCESSING' AND lease_expires_at>clock_timestamp()) THEN RETURN false; END IF;
  IF a.status<>'SUCCEEDED' THEN
    UPDATE whatsapp_conversations SET pending_order_action=null WHERE id=a.conversation_id;
    UPDATE whatsapp_audio_assets SET status='FAILED',error_code='AUDIO_EXPIRED',error_message='El audio venció. Pedile al cliente que lo reenvíe.' WHERE message_id=p_message_id;
    UPDATE agent_jobs SET status='FAILED',completed_at=now(),last_error='El audio venció.',locked_by=null,locked_at=null,lease_expires_at=null
      WHERE source_message_id=p_message_id AND job_type='TRANSCRIBE_AUDIO' AND status IN ('PENDING','RETRY','PROCESSING');
    UPDATE agent_jobs SET status='PENDING',available_at=now() WHERE source_message_id=p_message_id AND job_type='PROCESS_CONVERSATION' AND status='WAITING';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_job_v2(p_worker_id text,p_job_type text,p_execution_mode text DEFAULT 'DAEMON',p_job_id uuid DEFAULT null,p_capacity integer DEFAULT 8)
RETURNS SETOF public.agent_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE; v_sim boolean;
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
      AND o.is_active AND c.status='ACTIVE'
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
          WHERE a.conversation_id=q.conversation_id AND (m.created_at,m.id)<=(src.created_at,src.id) AND a.status IN ('PENDING','PROCESSING'))
      ))
      AND NOT EXISTS(SELECT 1 FROM agent_jobs active WHERE active.organization_id=q.organization_id AND active.job_type=p_job_type AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>q.id GROUP BY active.organization_id HAVING count(*)>=2)
    ORDER BY q.available_at,q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 50
  LOOP
    IF p_job_type='PROCESS_CONVERSATION' THEN
      IF NOT pg_try_advisory_xact_lock(hashtextextended(j.conversation_id::text,0)) THEN CONTINUE; END IF;
      IF EXISTS(SELECT 1 FROM agent_jobs active WHERE active.conversation_id=j.conversation_id AND active.job_type='PROCESS_CONVERSATION' AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>j.id) THEN CONTINUE; END IF;
      IF EXISTS(SELECT 1 FROM whatsapp_audio_assets a JOIN whatsapp_messages m ON m.id=a.message_id JOIN whatsapp_messages src ON src.id=j.source_message_id
        WHERE a.conversation_id=j.conversation_id AND (m.created_at,m.id)<=(src.created_at,src.id) AND a.status IN ('PENDING','PROCESSING')) THEN CONTINUE; END IF;
    END IF;
    UPDATE agent_jobs SET status='PROCESSING',attempts=attempts+1,locked_at=now(),locked_by=p_worker_id,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '180 seconds',last_error=null WHERE id=j.id RETURNING * INTO j;
    RETURN NEXT j; RETURN;
  END LOOP;
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
    UPDATE whatsapp_conversations SET pending_order_action=null WHERE id=j.conversation_id;
    UPDATE whatsapp_audio_assets SET status='FAILED',error_code='TRANSCRIPTION_FAILED',error_message=left(p_error,500),expires_at=now()+interval '24 hours' WHERE message_id=j.source_message_id AND status<>'SUCCEEDED';
    UPDATE agent_jobs SET status='PENDING',available_at=now() WHERE source_message_id=j.source_message_id AND job_type='PROCESS_CONVERSATION' AND status='WAITING';
  END IF;
  IF j.job_type='PROCESS_CONVERSATION' AND v_terminal THEN
    UPDATE whatsapp_outbox SET status='UNKNOWN',updated_at=now() WHERE source_message_id=j.source_message_id AND status='SENDING';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_whatsapp_outbox(p_job_id uuid,p_lease_token uuid,p_text text,p_order_prompt boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE; x whatsapp_outbox%ROWTYPE;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  INSERT INTO whatsapp_outbox(source_message_id,organization_id,conversation_id,text,order_prompt)
  VALUES(j.source_message_id,j.organization_id,j.conversation_id,p_text,p_order_prompt) ON CONFLICT DO NOTHING;
  SELECT * INTO x FROM whatsapp_outbox WHERE source_message_id=j.source_message_id FOR UPDATE;
  IF j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'El trabajo perdió su exclusión'; END IF;
  IF x.status='SENDING' THEN
    UPDATE whatsapp_outbox SET status='UNKNOWN',updated_at=now() WHERE source_message_id=j.source_message_id RETURNING * INTO x;
  ELSIF x.status='PENDING' THEN
    IF j.source_message_id <> (SELECT m.id FROM whatsapp_messages m WHERE m.conversation_id=j.conversation_id AND m.direction='INBOUND' ORDER BY m.created_at DESC,m.id DESC LIMIT 1) THEN
      UPDATE whatsapp_outbox SET status='CANCELLED',updated_at=now() WHERE source_message_id=j.source_message_id RETURNING * INTO x;
    ELSIF NOT EXISTS(SELECT 1 FROM whatsapp_conversations c JOIN whatsapp_integrations wi ON wi.id=c.integration_id
      WHERE c.id=j.conversation_id AND wi.id=j.integration_id AND wi.status='ACTIVE'
        AND public.is_whatsapp_mode_enabled(j.organization_id,wi.phone_number_id)
        AND (c.automation_resumed_at IS NULL OR (SELECT created_at FROM whatsapp_messages WHERE id=j.source_message_id)>c.automation_resumed_at)
        AND (c.status='ACTIVE' OR (c.status='HANDOFF' AND x.text=coalesce(wi.handoff_message,'Una persona del equipo comercial va a continuar la atención por este chat.')))) THEN
      UPDATE whatsapp_outbox SET status='CANCELLED',updated_at=now() WHERE source_message_id=j.source_message_id RETURNING * INTO x;
    ELSE
      UPDATE whatsapp_outbox SET status='SENDING',lease_token=p_lease_token,updated_at=now() WHERE source_message_id=j.source_message_id RETURNING * INTO x;
    END IF;
  END IF;
  RETURN to_jsonb(x);
END $$;

CREATE OR REPLACE FUNCTION public.record_whatsapp_simulation_outbound(
  p_job_id uuid,p_lease_token uuid,p_text text,p_order_prompt boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE; message_id uuid;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  IF j.execution_mode<>'INLINE' OR NOT EXISTS(SELECT 1 FROM whatsapp_integrations
    WHERE id=j.integration_id AND organization_id=j.organization_id
      AND phone_number_id LIKE 'rhinos-local-simulator:%' AND status='DRAFT'
      AND public.is_whatsapp_mode_enabled(j.organization_id,phone_number_id))
    OR NOT EXISTS(SELECT 1 FROM whatsapp_conversations c JOIN whatsapp_messages m ON m.id=j.source_message_id
      WHERE c.id=j.conversation_id AND c.status IN ('ACTIVE','HANDOFF')
        AND (c.automation_resumed_at IS NULL OR m.created_at>c.automation_resumed_at)) THEN
    RAISE EXCEPTION 'La sesión no está disponible';
  END IF;
  IF EXISTS(SELECT 1 FROM whatsapp_messages m JOIN whatsapp_messages src ON src.id=j.source_message_id
    WHERE m.conversation_id=j.conversation_id AND m.direction='INBOUND'
      AND (m.created_at,m.id)>(src.created_at,src.id)) THEN RAISE EXCEPTION 'El mensaje fue reemplazado'; END IF;
  INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content,payload,delivery_status)
  VALUES(j.organization_id,j.integration_id,j.conversation_id,'local-simulator-response:'||j.source_message_id,'OUTBOUND','TEXT',p_text,
    jsonb_build_object('source','LOCAL_SIMULATOR','sentToWhatsApp',false,'sourceMessageId',j.source_message_id,'orderPrompt',p_order_prompt),'FAILED')
  ON CONFLICT(external_message_id) DO NOTHING RETURNING id INTO message_id;
  IF message_id IS NULL THEN SELECT id INTO message_id FROM whatsapp_messages WHERE external_message_id='local-simulator-response:'||j.source_message_id; END IF;
  UPDATE whatsapp_conversations SET last_message_at=now() WHERE id=j.conversation_id;
  RETURN message_id;
END $$;
REVOKE ALL ON FUNCTION public.record_whatsapp_simulation_outbound(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_simulation_outbound(uuid,uuid,text,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.lock_whatsapp_job_lease(uuid,uuid,text),public.mutate_whatsapp_order_leased(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,integer,jsonb),public.validate_whatsapp_audio_asset(uuid,uuid,text,integer,numeric,text),public.expire_whatsapp_audio_asset(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lock_whatsapp_job_lease(uuid,uuid,text),public.mutate_whatsapp_order_leased(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,integer,jsonb),public.validate_whatsapp_audio_asset(uuid,uuid,text,integer,numeric,text),public.expire_whatsapp_audio_asset(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.renew_whatsapp_job_lease(p_job_id uuid,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agent_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='PROCESSING' FOR UPDATE;
  IF NOT FOUND OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() THEN RETURN false; END IF;
  UPDATE agent_jobs SET lease_expires_at=clock_timestamp()+interval '180 seconds' WHERE id=j.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_transcription(p_job_id uuid,p_lease_token uuid,p_text text,p_model text,p_request_id text DEFAULT null,p_latency_ms integer DEFAULT null)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agent_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='PROCESSING' AND job_type='TRANSCRIBE_AUDIO' FOR UPDATE;
  IF NOT FOUND OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() THEN RETURN false; END IF;
  IF length(btrim(p_text)) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Transcripción inválida'; END IF;
  UPDATE whatsapp_messages SET content=p_text WHERE id=j.source_message_id AND organization_id=j.organization_id;
  UPDATE whatsapp_audio_assets SET status='SUCCEEDED',model=p_model,request_id=p_request_id,latency_ms=p_latency_ms,error_code=null,error_message=null,expires_at=now()+interval '24 hours' WHERE message_id=j.source_message_id;
  UPDATE agent_jobs SET status='PENDING',available_at=now() WHERE source_message_id=j.source_message_id AND job_type='PROCESS_CONVERSATION' AND status='WAITING';
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_whatsapp_audio_usage(p_job_id uuid,p_lease_token uuid,p_seconds numeric) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agent_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='PROCESSING' FOR UPDATE;
  IF NOT FOUND OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() OR j.job_type<>'TRANSCRIBE_AUDIO' THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(j.organization_id::text||'-audio-usage',0));
  IF j.lease_expires_at<=clock_timestamp() THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM whatsapp_processing_usage WHERE job_id=j.id) THEN RETURN true; END IF;
  IF (SELECT count(*) FROM whatsapp_processing_usage WHERE organization_id=j.organization_id AND day=(now() AT TIME ZONE 'UTC')::date)>=100 THEN RETURN false; END IF;
  INSERT INTO whatsapp_processing_usage(job_id,organization_id,reserved_seconds) VALUES(j.id,j.organization_id,p_seconds);
  RETURN true;
END $$;

-- Only the current owner may turn an interrupted send into an uncertain one.
CREATE OR REPLACE FUNCTION public.recover_whatsapp_outbox(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE; x whatsapp_outbox%ROWTYPE;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  SELECT * INTO x FROM whatsapp_outbox WHERE source_message_id=j.source_message_id FOR UPDATE;
  IF NOT FOUND THEN RETURN null; END IF;
  IF x.status='SENDING' THEN
    UPDATE whatsapp_outbox SET status='UNKNOWN',updated_at=now() WHERE source_message_id=j.source_message_id RETURNING * INTO x;
  END IF;
  RETURN to_jsonb(x);
END $$;
REVOKE ALL ON FUNCTION public.recover_whatsapp_outbox(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_whatsapp_outbox(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_worker_protocol_version() RETURNS integer
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'ingest_whatsapp_inbound_message','claim_whatsapp_agent_job',
      'finish_whatsapp_agent_job','defer_whatsapp_agent_job',
      'record_whatsapp_delivery_status','record_whatsapp_outbound_message',
      'mutate_whatsapp_order','set_whatsapp_automation',
      'complete_whatsapp_audio_upload','claim_whatsapp_job_v2',
      'renew_whatsapp_job_lease','finish_whatsapp_job_v2',
      'reserve_whatsapp_audio_usage','complete_whatsapp_transcription',
      'assert_whatsapp_job_lease','assert_whatsapp_audio_job',
      'prepare_whatsapp_outbox','complete_whatsapp_outbox','recover_whatsapp_outbox','whatsapp_worker_protocol_version',
      'lock_whatsapp_job_lease','mutate_whatsapp_order_leased',
      'validate_whatsapp_audio_asset','expire_whatsapp_audio_asset',
      'record_whatsapp_simulation_outbound','whatsapp_product_recommendations'
    )
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN 0 ELSE 2 END
$$;
REVOKE ALL ON FUNCTION public.whatsapp_worker_protocol_version() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_worker_protocol_version() TO service_role;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_simulation_text() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.direction='INBOUND' AND NEW.message_type='TEXT'
    AND EXISTS(SELECT 1 FROM whatsapp_integrations wi WHERE wi.id=NEW.integration_id
      AND wi.organization_id=NEW.organization_id AND wi.status='DRAFT'
      AND wi.phone_number_id LIKE 'rhinos-local-simulator:%'
      AND public.is_whatsapp_mode_enabled(wi.organization_id,wi.phone_number_id)) THEN
    INSERT INTO agent_jobs(organization_id,integration_id,conversation_id,source_message_id,job_type,execution_mode)
    VALUES(NEW.organization_id,NEW.integration_id,NEW.conversation_id,NEW.id,'PROCESS_CONVERSATION','INLINE')
    ON CONFLICT(source_message_id,job_type) DO NOTHING;
  ELSIF NEW.direction='INBOUND' AND NEW.message_type='AUDIO'
    AND NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets WHERE message_id=NEW.id) THEN
    -- Unsupported audio must invalidate an earlier yes/no prompt too.
    UPDATE whatsapp_conversations SET pending_order_action=null WHERE id=NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enqueue_whatsapp_simulation_text ON public.whatsapp_messages;
-- Alphabetical trigger order puts this after enqueue_whatsapp_audio.
CREATE TRIGGER enqueue_whatsapp_simulation_text AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_simulation_text();
REVOKE ALL ON FUNCTION public.enqueue_whatsapp_simulation_text() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
