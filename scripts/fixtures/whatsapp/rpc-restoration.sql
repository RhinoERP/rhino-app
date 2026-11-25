-- Disposable database only, after human-control.sql. All fixture changes roll back.
BEGIN;
DROP FUNCTION public.finish_whatsapp_agent_job(uuid, text, boolean, text, integer);
DROP FUNCTION public.whatsapp_product_recommendations(uuid, text, uuid);

\ir ../../../supabase/migrations/20261117133042_restore_whatsapp_missing_rpcs.sql
\ir ../../../supabase/migrations/20261117133042_restore_whatsapp_missing_rpcs.sql

DO $$
DECLARE
  f public.whatsapp_control_fixture%ROWTYPE;
  source_id uuid;
  job public.agent_jobs%ROWTYPE;
  result public.agent_jobs%ROWTYPE;
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.finish_whatsapp_agent_job(uuid,text,boolean,text,integer)'::regprocedure,
    'public.whatsapp_product_recommendations(uuid,text,uuid)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',fn,'EXECUTE')
      OR has_function_privilege('authenticated',fn,'EXECUTE')
      OR NOT has_function_privilege('service_role',fn,'EXECUTE') THEN
      RAISE EXCEPTION 'Restored RPC permissions are unsafe: %',fn;
    END IF;
  END LOOP;
  IF NOT public.whatsapp_guarded_dispatch_ready() OR NOT public.whatsapp_customer_pricing_ready() THEN
    RAISE EXCEPTION 'Restoration changed current protocol readiness';
  END IF;
  IF EXISTS(SELECT 1 FROM public.whatsapp_product_recommendations('00000000-0000-0000-0000-000000000000')) THEN
    RAISE EXCEPTION 'Recommendations leaked another organization';
  END IF;

  SELECT * INTO STRICT f FROM public.whatsapp_control_fixture;
  INSERT INTO public.whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content,payload)
    VALUES(f.org,f.wi,f.c,gen_random_uuid()::text,'INBOUND','RPC restoration fixture','{}')
    RETURNING id INTO source_id;
  INSERT INTO public.agent_jobs(organization_id,integration_id,conversation_id,source_message_id,status,locked_at,locked_by,attempts)
    VALUES(f.org,f.wi,f.c,source_id,'PROCESSING',now(),'rpc-restoration',1)
    RETURNING * INTO job;
  BEGIN
    PERFORM public.finish_whatsapp_agent_job(job.id,'another-worker',true);
    RAISE EXCEPTION USING ERRCODE='XX000', MESSAGE='Wrong worker completed a job';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  result:=public.finish_whatsapp_agent_job(job.id,'rpc-restoration',false,'Retry fixture',5);
  IF result.status<>'RETRY' OR result.locked_by IS NOT NULL OR result.last_error<>'Retry fixture' THEN
    RAISE EXCEPTION 'Legacy retry lost its state or error';
  END IF;
  UPDATE public.agent_jobs SET status='PROCESSING',locked_by='rpc-restoration' WHERE id=job.id;
  result:=public.finish_whatsapp_agent_job(job.id,'rpc-restoration',true);
  IF result.status<>'SUCCEEDED' OR result.completed_at IS NULL OR result.locked_by IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy completion failed';
  END IF;
  UPDATE public.agent_jobs SET status='PROCESSING',locked_by='rpc-restoration',attempts=max_attempts WHERE id=job.id;
  result:=public.finish_whatsapp_agent_job(job.id,'rpc-restoration',false,'Failure fixture');
  IF result.status<>'FAILED' OR result.last_error<>'Failure fixture' OR result.locked_by IS NOT NULL THEN
    RAISE EXCEPTION 'Exhausted legacy job did not fail';
  END IF;
END $$;
ROLLBACK;
