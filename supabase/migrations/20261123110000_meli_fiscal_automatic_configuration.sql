-- Explicit fiscal account mapping and durable pending work for authorized vouchers.
BEGIN;

CREATE TABLE public.mercadolibre_fiscal_automatic_configurations (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  currency text NOT NULL CHECK (currency IN ('ARS', 'USD')),
  accounts jsonb NOT NULL CHECK (jsonb_typeof(accounts) = 'object'),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, currency)
);

CREATE TABLE public.mercadolibre_fiscal_automatic_configuration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  currency text NOT NULL CHECK (currency IN ('ARS', 'USD')),
  accounts jsonb NOT NULL CHECK (jsonb_typeof(accounts) = 'object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mercadolibre_fiscal_automatic_pending (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sale_id uuid NOT NULL REFERENCES public.sales_orders(id),
  origin_type text NOT NULL CHECK (origin_type IN ('invoice', 'creditNote')),
  origin_id uuid NOT NULL,
  request_key uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, origin_type, origin_id),
  UNIQUE (organization_id, request_key),
  CHECK (origin_type <> 'invoice' OR origin_id = sale_id)
);

ALTER TABLE public.mercadolibre_fiscal_automatic_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolibre_fiscal_automatic_configuration_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolibre_fiscal_automatic_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_fiscal_automatic_configurations,
  public.mercadolibre_fiscal_automatic_configuration_audit,
  public.mercadolibre_fiscal_automatic_pending FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_meli_fiscal_automatic_configuration(
  p_org_id uuid, p_actor_id uuid, p_currency text, p_accounts jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean; v_accounts jsonb;
BEGIN
  v_admin := public.assert_meli_accounting_access(p_org_id, p_actor_id);
  IF NOT v_admin THEN
    RAISE EXCEPTION 'Solo un administrador puede configurar las cuentas fiscales automáticas'
      USING ERRCODE = '42501';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('ARS', 'USD')
    OR p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'object'
    OR NOT (p_accounts ? 'receivable') THEN
    RAISE EXCEPTION 'Configuración fiscal inválida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mercadolibre_fiscal_automatic_configurations
    (organization_id, currency, accounts, updated_by)
    VALUES (p_org_id, p_currency, p_accounts, p_actor_id)
    ON CONFLICT (organization_id, currency) DO UPDATE
      SET accounts = public.mercadolibre_fiscal_automatic_configurations.accounts || EXCLUDED.accounts,
        updated_by = EXCLUDED.updated_by, updated_at = now()
    RETURNING accounts INTO v_accounts;
  INSERT INTO public.mercadolibre_fiscal_automatic_configuration_audit
    (organization_id, currency, accounts, actor_id)
    VALUES (p_org_id, p_currency, v_accounts, p_actor_id);
END;
$$;

CREATE FUNCTION public.enqueue_meli_authorized_fiscal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_type text; v_sale_id uuid;
BEGIN
  IF NEW.sales_channel IS DISTINCT FROM 'MERCADO_LIBRE'
    OR NEW.arca_status IS DISTINCT FROM 'authorized'
    OR OLD.arca_status IS NOT DISTINCT FROM NEW.arca_status THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'sales_orders' THEN
    v_type := 'invoice';
    v_sale_id := NEW.id;
  ELSE
    v_type := 'creditNote';
    v_sale_id := NEW.sales_order_id;
  END IF;
  INSERT INTO public.mercadolibre_fiscal_automatic_pending
    (organization_id, sale_id, origin_type, origin_id)
    VALUES (NEW.organization_id, v_sale_id, v_type, NEW.id)
    ON CONFLICT (organization_id, origin_type, origin_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meli_invoice_fiscal_automatic_pending
  AFTER UPDATE OF arca_status ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_meli_authorized_fiscal();
CREATE TRIGGER meli_credit_note_fiscal_automatic_pending
  AFTER UPDATE OF arca_status ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_meli_authorized_fiscal();

REVOKE ALL ON FUNCTION public.save_meli_fiscal_automatic_configuration(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_meli_fiscal_automatic_configuration(uuid, uuid, text, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_meli_authorized_fiscal()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.mercadolibre_fiscal_automatic_configurations,
  public.mercadolibre_fiscal_automatic_pending TO service_role;
COMMIT;
