BEGIN;

-- Fiscal settings are deliberately separate from WSFE certificates and login secrets.
CREATE TABLE public.remittance_fiscal_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  cuit text NOT NULL CHECK (cuit ~ '^[0-9]{11}$'),
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL CHECK (mode IN ('preprinted', 'self_printed')),
  login_cuit text NOT NULL CHECK (login_cuit ~ '^[0-9]{11}$'),
  point_of_sale integer NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  business_name text NOT NULL, address text NOT NULL, vat_condition text NOT NULL,
  gross_income text NOT NULL, activity_start date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX remittance_fiscal_issuer_point ON public.remittance_fiscal_settings(cuit, point_of_sale) WHERE enabled;

CREATE TABLE public.remittance_cai_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  request_key uuid NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id),
  kind text NOT NULL CHECK (kind IN ('validate', 'request', 'check_cancel', 'cancel')),
  state text NOT NULL DEFAULT 'starting' CHECK (state IN ('starting', 'pending', 'complete', 'uncertain', 'failed')),
  provider_id text, params jsonb NOT NULL, result jsonb, error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, request_key),
  CHECK (NOT (params ?| ARRAY['password', 'cert', 'key', 'access_token']))
);
-- An ambiguous network result must be reconciled, never silently resubmitted.
CREATE UNIQUE INDEX remittance_cai_one_pending ON public.remittance_cai_operations(organization_id)
  WHERE state IN ('starting', 'pending', 'uncertain');

CREATE TABLE public.remittance_cai_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  cuit text NOT NULL CHECK (cuit ~ '^[0-9]{11}$'),
  point_of_sale integer NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  mode text NOT NULL CHECK (mode IN ('preprinted', 'self_printed')),
  cai text NOT NULL CHECK (cai ~ '^[0-9]{14}$'), expires_at date NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'replaced', 'cancelled')),
  first_number integer, last_number integer, next_number integer,
  issued_count integer NOT NULL DEFAULT 0 CHECK (issued_count >= 0),
  printer_name text NOT NULL DEFAULT '', printer_cuit text NOT NULL DEFAULT '',
  printer_registration text NOT NULL DEFAULT '', printed_at text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id), activated_by uuid REFERENCES auth.users(id), activated_at timestamptz,
  source_operation_id uuid UNIQUE REFERENCES public.remittance_cai_operations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, cai, point_of_sale),
  CHECK (first_number IS NULL OR first_number BETWEEN 1 AND 99999999),
  CHECK (last_number IS NULL OR last_number BETWEEN first_number AND 99999999),
  CHECK (next_number IS NULL OR next_number BETWEEN first_number AND 100000000),
  CHECK (state <> 'active' OR (first_number IS NOT NULL AND next_number IS NOT NULL AND evidence <> '')),
  CHECK (state <> 'active' OR mode <> 'preprinted' OR (last_number IS NOT NULL AND printer_name <> '' AND printer_cuit ~ '^[0-9]{11}$' AND printer_registration <> '' AND printed_at <> ''))
);
CREATE UNIQUE INDEX remittance_cai_one_active ON public.remittance_cai_authorizations(organization_id, cuit, point_of_sale) WHERE state = 'active';

-- Receipt links contain a random bearer secret; only its SHA-256 digest is persisted.
CREATE TABLE public.remittance_receipts (
  remittance_id uuid PRIMARY KEY REFERENCES public.order_remittances(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  token_hash text UNIQUE NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz, receiver_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (receiver_name IS NULL OR length(receiver_name) BETWEEN 2 AND 200)
);

ALTER TABLE public.remittance_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_cai_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_cai_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remittance_fiscal_settings, public.remittance_cai_operations,
  public.remittance_cai_authorizations, public.remittance_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.remittance_fiscal_settings, public.remittance_cai_operations,
  public.remittance_cai_authorizations, public.remittance_receipts TO service_role;

CREATE FUNCTION public.save_remittance_fiscal_settings(p_org_id uuid, p_settings jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.remittance_fiscal_settings%ROWTYPE; v_cuit text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501'; END IF;
  SELECT regexp_replace(cuit, '[^0-9]', '', 'g') INTO STRICT v_cuit FROM public.organizations WHERE id = p_org_id FOR UPDATE;
  SELECT * INTO v_old FROM public.remittance_fiscal_settings WHERE organization_id = p_org_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.remittance_cai_operations WHERE organization_id = p_org_id AND state IN ('starting','pending','uncertain')) THEN
    RAISE EXCEPTION 'Consultá o conciliá la solicitud pendiente antes de cambiar la configuración';
  END IF;
  IF EXISTS(SELECT 1 FROM public.remittance_cai_authorizations WHERE organization_id = p_org_id AND state = 'active')
    AND (v_old.cuit IS DISTINCT FROM v_cuit OR v_old.point_of_sale IS DISTINCT FROM (p_settings->>'pointOfSale')::integer
      OR v_old.mode IS DISTINCT FROM p_settings->>'mode') THEN
    RAISE EXCEPTION 'El punto de venta y la modalidad no pueden cambiar con un CAI activo';
  END IF;
  INSERT INTO public.remittance_fiscal_settings(organization_id,cuit,enabled,mode,login_cuit,point_of_sale,business_name,address,vat_condition,gross_income,activity_start)
    VALUES(p_org_id,v_cuit,(p_settings->>'enabled')::boolean,p_settings->>'mode',p_settings->>'loginCuit',
      (p_settings->>'pointOfSale')::integer,p_settings->>'businessName',p_settings->>'address',p_settings->>'vatCondition',p_settings->>'grossIncome',(p_settings->>'activityStart')::date)
    ON CONFLICT(organization_id) DO UPDATE SET cuit=excluded.cuit,enabled=excluded.enabled,mode=excluded.mode,
      login_cuit=excluded.login_cuit,point_of_sale=excluded.point_of_sale,business_name=excluded.business_name,address=excluded.address,
      vat_condition=excluded.vat_condition,gross_income=excluded.gross_income,activity_start=excluded.activity_start,updated_at=now();
  INSERT INTO public.organization_settings(organization_id,settings) VALUES(p_org_id,jsonb_build_object('remittance_fiscal_enabled',(p_settings->>'enabled')::boolean,'remittance_fiscal_mode',p_settings->>'mode'))
    ON CONFLICT(organization_id) DO UPDATE SET settings=public.organization_settings.settings || jsonb_build_object('remittance_fiscal_enabled',(p_settings->>'enabled')::boolean,'remittance_fiscal_mode',p_settings->>'mode'),updated_at=now();
END;
$$;

CREATE FUNCTION public.activate_remittance_cai(p_org_id uuid, p_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_settings public.remittance_fiscal_settings%ROWTYPE; v_auth public.remittance_cai_authorizations%ROWTYPE; v_max integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=p_org_id FOR UPDATE;
  SELECT * INTO STRICT v_settings FROM public.remittance_fiscal_settings WHERE organization_id=p_org_id FOR UPDATE;
  SELECT * INTO STRICT v_auth FROM public.remittance_cai_authorizations WHERE organization_id=p_org_id AND id=(p_data->>'authorizationId')::uuid FOR UPDATE;
  IF v_auth.state = 'active' THEN RETURN; END IF;
  IF v_auth.state <> 'draft' THEN RAISE EXCEPTION 'La autorización ya no está pendiente de activación'; END IF;
  IF v_auth.expires_at < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN RAISE EXCEPTION 'El CAI está vencido'; END IF;
  IF v_auth.cuit <> v_settings.cuit OR v_auth.point_of_sale <> v_settings.point_of_sale OR v_auth.mode <> v_settings.mode THEN RAISE EXCEPTION 'El CAI no corresponde a esta configuración'; END IF;
  IF coalesce((p_data->>'confirmed')::boolean,false) IS NOT TRUE OR nullif(btrim(p_data->>'evidence'),'') IS NULL THEN RAISE EXCEPTION 'Verificá la constancia de ARCA'; END IF;
  IF EXISTS(SELECT 1 FROM public.remittance_cai_operations WHERE organization_id=p_org_id AND state IN ('starting','pending','uncertain')) THEN RAISE EXCEPTION 'Primero resolvé la operación pendiente'; END IF;
  SELECT max((header_snapshot->'remittance'->'fiscal'->>'number')::integer) INTO v_max FROM public.order_remittances
    WHERE organization_id=p_org_id AND header_snapshot->'remittance'->'fiscal'->>'cuit'=v_auth.cuit
      AND (header_snapshot->'remittance'->'fiscal'->>'pointOfSale')::integer=v_auth.point_of_sale;
  SELECT greatest(coalesce(v_max,0),coalesce(max(next_number-1),0)) INTO v_max FROM public.remittance_cai_authorizations
    WHERE organization_id=p_org_id AND cuit=v_auth.cuit AND point_of_sale=v_auth.point_of_sale AND state IN ('active','replaced');
  IF (p_data->>'lastUsedNumber')::integer < v_max OR (p_data->>'lastUsedNumber')::integer < (p_data->>'firstNumber')::integer-1
    OR (p_data->>'lastUsedNumber')::integer >= coalesce((p_data->>'lastNumber')::integer,99999999) THEN RAISE EXCEPTION 'La numeración retrocede o está fuera del rango autorizado'; END IF;
  UPDATE public.remittance_cai_authorizations SET state='replaced' WHERE organization_id=p_org_id AND cuit=v_auth.cuit AND point_of_sale=v_auth.point_of_sale AND state='active';
  UPDATE public.remittance_cai_authorizations SET state='active',first_number=(p_data->>'firstNumber')::integer,
    last_number=(p_data->>'lastNumber')::integer,next_number=(p_data->>'lastUsedNumber')::integer+1,
    printer_name=p_data->>'printerName',printer_cuit=p_data->>'printerCuit',printer_registration=p_data->>'printerRegistration',
    printed_at=p_data->>'printedAt',evidence=p_data->>'evidence',activated_by=(p_data->>'activatedBy')::uuid,activated_at=now() WHERE id=v_auth.id;
END;
$$;

CREATE FUNCTION public.assign_remittance_cai()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.remittance_fiscal_settings%ROWTYPE; a public.remittance_cai_authorizations%ROWTYPE; snapshot jsonb;
BEGIN
  PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
  SELECT * INTO s FROM public.remittance_fiscal_settings WHERE organization_id=NEW.organization_id FOR UPDATE;
  IF NOT FOUND OR NOT s.enabled THEN
    IF NEW.header_snapshot->'remittance' ? 'fiscal' THEN RAISE EXCEPTION 'La emisión fiscal no está habilitada'; END IF;
    RETURN NEW;
  END IF;
  IF s.cuit IS DISTINCT FROM (SELECT regexp_replace(cuit,'[^0-9]','','g') FROM public.organizations WHERE id=NEW.organization_id) THEN RAISE EXCEPTION 'Cambió el CUIT de la organización; revisá la configuración fiscal'; END IF;
  IF EXISTS(SELECT 1 FROM public.remittance_cai_operations WHERE organization_id=NEW.organization_id AND kind='cancel' AND state IN ('starting','pending','uncertain')) THEN RAISE EXCEPTION 'Hay una anulación de CAI pendiente'; END IF;
  SELECT * INTO a FROM public.remittance_cai_authorizations WHERE organization_id=NEW.organization_id AND cuit=s.cuit AND point_of_sale=s.point_of_sale AND mode=s.mode AND state='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Activá un CAI en Configuración → Comprobantes antes de despachar'; END IF;
  IF a.expires_at < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date OR NEW.issue_date > a.expires_at THEN RAISE EXCEPTION 'El CAI está vencido. Renovalo antes de despachar'; END IF;
  IF a.next_number > coalesce(a.last_number,99999999) THEN RAISE EXCEPTION 'Se agotó la numeración autorizada'; END IF;
  IF nullif(btrim(NEW.header_snapshot->'remittance'->'customer'->>'businessName'),'') IS NULL
    OR nullif(btrim(NEW.header_snapshot->'remittance'->'customer'->>'cuit'),'') IS NULL
    OR nullif(btrim(NEW.header_snapshot->'remittance'->'customer'->>'address'),'') IS NULL THEN
    RAISE EXCEPTION 'Completá razón social, CUIT o DNI y domicilio del destinatario antes de emitir';
  END IF;
  NEW.document_number := lpad(s.point_of_sale::text,5,'0') || '-' || lpad(a.next_number::text,8,'0');
  snapshot := jsonb_build_object('authorizationId',a.id,'cai',a.cai,'expiresAt',a.expires_at,'pointOfSale',s.point_of_sale,'number',a.next_number,
    'mode',s.mode,'firstNumber',a.first_number,'lastNumber',a.last_number,'businessName',s.business_name,'cuit',s.cuit,'address',s.address,
    'vatCondition',s.vat_condition,'grossIncome',s.gross_income,'activityStart',s.activity_start,'printerName',a.printer_name,
    'printerCuit',a.printer_cuit,'printerRegistration',a.printer_registration,'printedAt',a.printed_at);
  NEW.header_snapshot := jsonb_set(NEW.header_snapshot,'{remittance,fiscal}',snapshot);
  UPDATE public.remittance_cai_authorizations SET next_number=next_number+1,issued_count=issued_count+1 WHERE id=a.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assign_remittance_cai BEFORE INSERT ON public.order_remittances FOR EACH ROW EXECUTE FUNCTION public.assign_remittance_cai();

CREATE FUNCTION public.guard_fiscal_remittance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.header_snapshot->'remittance' ? 'fiscal' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Los remitos fiscales deben conservarse'; END IF;
    IF NEW.document_number IS DISTINCT FROM OLD.document_number OR NEW.header_snapshot IS DISTINCT FROM OLD.header_snapshot
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Los datos de un remito fiscal emitido no pueden modificarse';
    END IF;
  ELSIF TG_OP='UPDATE' AND NEW.header_snapshot->'remittance' ? 'fiscal' THEN
    RAISE EXCEPTION 'Un documento histórico no puede convertirse en remito fiscal';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_fiscal_remittance BEFORE UPDATE OR DELETE ON public.order_remittances FOR EACH ROW EXECUTE FUNCTION public.guard_fiscal_remittance();

CREATE FUNCTION public.guard_fiscal_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.orders WHERE id=NEW.order_id;
  IF EXISTS(SELECT 1 FROM public.remittance_fiscal_settings WHERE organization_id=v_org AND enabled)
    AND NOT EXISTS(SELECT 1 FROM public.order_remittances r JOIN public.order_remittance_batches b ON b.id=r.batch_id
      WHERE r.organization_id=v_org AND b.dispatch_group_id=NEW.dispatch_group_id AND r.header_snapshot->'remittance' ? 'fiscal') THEN
    RAISE EXCEPTION 'Usá Preparar remitos y despachar para emitir el remito con CAI';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_fiscal_dispatch BEFORE INSERT ON public.order_dispatch_events FOR EACH ROW EXECUTE FUNCTION public.guard_fiscal_dispatch();

CREATE FUNCTION public.begin_remittance_cai_operation(p_org_id uuid,p_actor_id uuid,p_key uuid,p_kind text,p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op public.remittance_cai_operations%ROWTYPE; s public.remittance_fiscal_settings%ROWTYPE;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=p_org_id FOR UPDATE;
  SELECT * INTO v_op FROM public.remittance_cai_operations WHERE organization_id=p_org_id AND request_key=p_key;
  IF FOUND THEN
    IF v_op.kind <> p_kind OR v_op.params <> p_params OR v_op.created_by <> p_actor_id THEN RAISE EXCEPTION 'El intento ya corresponde a otra solicitud'; END IF;
    RETURN to_jsonb(v_op);
  END IF;
  SELECT * INTO STRICT s FROM public.remittance_fiscal_settings WHERE organization_id=p_org_id FOR UPDATE;
  IF p_params->>'cuit' IS DISTINCT FROM s.cuit OR p_params->>'username' IS DISTINCT FROM s.login_cuit THEN RAISE EXCEPTION 'Cambió la configuración de acceso'; END IF;
  IF EXISTS(SELECT 1 FROM public.remittance_cai_operations WHERE organization_id=p_org_id AND state IN ('starting','pending','uncertain')) THEN RAISE EXCEPTION 'Primero consultá o conciliá la operación pendiente'; END IF;
  IF p_kind='request' AND NOT EXISTS(SELECT 1 FROM public.remittance_cai_operations WHERE organization_id=p_org_id
    AND kind='validate' AND state='complete' AND result->>'status'='validated' AND params-'validateOnly'=p_params-'validateOnly'
    AND created_at > now()-interval '1 hour') THEN RAISE EXCEPTION 'Validá esta solicitud en ARCA antes de emitir el CAI'; END IF;
  IF p_kind='cancel' AND NOT EXISTS(SELECT 1 FROM public.remittance_cai_operations WHERE organization_id=p_org_id
    AND kind='check_cancel' AND state='complete' AND result->>'status'='cancellable' AND params->>'cai'=p_params->>'cai'
    AND created_at > now()-interval '15 minutes') THEN RAISE EXCEPTION 'Verificá nuevamente que ARCA permite anular el CAI'; END IF;
  IF p_kind IN ('cancel','check_cancel') AND NOT EXISTS(SELECT 1 FROM public.remittance_cai_authorizations
    WHERE organization_id=p_org_id AND cai=p_params->>'cai' AND issued_count=0 AND state IN ('draft','active')) THEN
    RAISE EXCEPTION 'El CAI no está disponible para anular o ya se utilizó';
  END IF;
  INSERT INTO public.remittance_cai_operations(organization_id,request_key,created_by,kind,params)
    VALUES(p_org_id,p_key,p_actor_id,p_kind,p_params) RETURNING * INTO v_op;
  RETURN to_jsonb(v_op);
END;
$$;

CREATE FUNCTION public.complete_remittance_cai_operation(p_org_id uuid,p_id uuid,p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op public.remittance_cai_operations%ROWTYPE; s public.remittance_fiscal_settings%ROWTYPE;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=p_org_id FOR UPDATE;
  SELECT * INTO STRICT op FROM public.remittance_cai_operations WHERE organization_id=p_org_id AND id=p_id FOR UPDATE;
  IF op.state='complete' THEN RETURN; END IF;
  IF op.state='failed' THEN RAISE EXCEPTION 'La operación ya fue conciliada'; END IF;
  SELECT * INTO STRICT s FROM public.remittance_fiscal_settings WHERE organization_id=p_org_id;
  IF op.kind='request' THEN
    IF p_result->>'status' <> 'requested' THEN RAISE EXCEPTION 'La solicitud no devolvió una autorización'; END IF;
    INSERT INTO public.remittance_cai_authorizations(organization_id,cuit,point_of_sale,mode,cai,expires_at,source_operation_id,created_by)
      VALUES(p_org_id,op.params->>'cuit',(op.params->'comprobantes'->0->>'puntoVenta')::integer,s.mode,p_result->>'cai',(p_result->>'expiresAt')::date,op.id,op.created_by);
  ELSIF op.kind='cancel' AND p_result->>'status' IN ('cancelled','already_cancelled') THEN
    UPDATE public.remittance_cai_authorizations SET state='cancelled' WHERE organization_id=p_org_id AND cai=op.params->>'cai' AND issued_count=0;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo conciliar la anulación'; END IF;
  ELSIF op.kind='check_cancel' AND p_result->>'status'='already_cancelled' THEN
    UPDATE public.remittance_cai_authorizations SET state='cancelled' WHERE organization_id=p_org_id AND cai=op.params->>'cai' AND issued_count=0;
  END IF;
  UPDATE public.remittance_cai_operations SET state='complete',result=p_result,error=NULL WHERE id=op.id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_remittance_cai_operation(uuid,uuid,uuid,text,jsonb),public.complete_remittance_cai_operation(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_remittance_cai_operation(uuid,uuid,uuid,text,jsonb),public.complete_remittance_cai_operation(uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.save_remittance_fiscal_settings(uuid,jsonb), public.activate_remittance_cai(uuid,jsonb),
  public.assign_remittance_cai(), public.guard_fiscal_remittance(), public.guard_fiscal_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_remittance_fiscal_settings(uuid,jsonb), public.activate_remittance_cai(uuid,jsonb) TO service_role;

-- Preserve the existing transactional dispatch implementation and its ACLs;
CREATE FUNCTION public.confirm_remittance_receipt(p_token_hash text,p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.remittance_receipts%ROWTYPE; v_status text;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT r FROM public.remittance_receipts WHERE token_hash=p_token_hash;
  SELECT status INTO STRICT v_status FROM public.order_remittances WHERE id=r.remittance_id AND organization_id=r.organization_id FOR UPDATE;
  IF v_status <> 'ISSUED' OR length(btrim(p_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Recepción inválida'; END IF;
  UPDATE public.remittance_receipts SET received_at=now(),receiver_name=btrim(p_name) WHERE remittance_id=r.remittance_id AND received_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_remittance_receipt(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_remittance_receipt(text,text) TO service_role;

-- fiscal numbering is independently enabled, not controlled by the legacy counter.
DO $upgrade$
DECLARE definition text; needle text := 'IF p_automatic_numbering AND NOT coalesce(v_org.remittance_auto_enabled, false) THEN';
BEGIN
  definition := pg_get_functiondef('public.persist_order_remittance_documents_internal(uuid,uuid,uuid,uuid[],uuid,text,boolean,jsonb)'::regprocedure);
  IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'No se encontró la validación de numeración a actualizar'; END IF;
  EXECUTE replace(definition,needle,'IF p_automatic_numbering AND NOT coalesce(v_org.remittance_auto_enabled, false) AND NOT EXISTS (SELECT 1 FROM public.remittance_fiscal_settings WHERE organization_id=p_org_id AND enabled) THEN');
END;
$upgrade$;
COMMIT;
