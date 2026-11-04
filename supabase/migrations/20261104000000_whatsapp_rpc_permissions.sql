-- Supabase grants EXECUTE directly to anon/authenticated by default.
-- Revoking PUBLIC alone does not remove those grants. Only these server RPCs
-- are restricted; helpers used by browser RLS policies keep their permissions.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.proname,pg_catalog.oidvectortypes(p.proargtypes) AS arguments
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
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
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',fn.proname,fn.arguments);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',fn.proname,fn.arguments);
  END LOOP;
END $$;
