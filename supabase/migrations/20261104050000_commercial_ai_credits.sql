-- IA Comercial · créditos.
-- Todo lo que cuesta plata (IA, mensajes de WhatsApp, audios) descuenta
-- créditos. 1 crédito = US$0,01 de costo nuestro.
-- Cada empresa tiene créditos del plan que se renuevan el día 1 (no se
-- acumulan) y créditos comprados que no vencen y se usan cuando se acaba el plan.
-- Los créditos comprados se pagan con Mercado Pago o los carga un superadmin.
-- Se puede correr más de una vez sin error.

-- 1) Consumo: además de la IA se registran WhatsApp y audio, con sus créditos.
ALTER TABLE public.commercial_ai_usage
  ADD COLUMN IF NOT EXISTS credits numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.commercial_ai_usage
  DROP CONSTRAINT IF EXISTS commercial_ai_usage_feature_check;
ALTER TABLE public.commercial_ai_usage
  ADD CONSTRAINT commercial_ai_usage_feature_check
  CHECK (feature IN ('asistente', 'campana', 'prueba', 'whatsapp', 'audio'));
-- Lo ya registrado pasa a créditos con la misma regla.
UPDATE public.commercial_ai_usage
  SET credits = round(cost_usd * 100, 2)
  WHERE credits = 0 AND cost_usd > 0;

-- 2) Plan de cada empresa, en créditos (lo fija un superadmin).
ALTER TABLE public.commercial_ai_limits
  ADD COLUMN IF NOT EXISTS monthly_included_credits integer
    CHECK (monthly_included_credits IS NULL OR monthly_included_credits >= 0),
  ADD COLUMN IF NOT EXISTS per_user_monthly_credits integer
    CHECK (per_user_monthly_credits IS NULL OR per_user_monthly_credits >= 0),
  ADD COLUMN IF NOT EXISTS unlimited boolean NOT NULL DEFAULT false;
-- Los topes en dólares que ya había pasan a créditos.
UPDATE public.commercial_ai_limits
  SET monthly_included_credits = round(monthly_usd_limit * 100)
  WHERE monthly_included_credits IS NULL AND monthly_usd_limit IS NOT NULL;
UPDATE public.commercial_ai_limits
  SET unlimited = true
  WHERE monthly_usd_limit IS NULL AND monthly_included_credits IS NULL;
UPDATE public.commercial_ai_limits
  SET per_user_monthly_credits = round(per_user_monthly_usd_limit * 100)
  WHERE per_user_monthly_credits IS NULL AND per_user_monthly_usd_limit IS NOT NULL;

-- 3) Billetera: lo usado en el mes y el saldo de créditos comprados.
CREATE TABLE IF NOT EXISTS public.commercial_ai_wallets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Primer día del mes (hora de Buenos Aires) al que corresponde month_used.
  month date NOT NULL DEFAULT date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))::date,
  month_used numeric(12, 2) NOT NULL DEFAULT 0,
  -- Créditos comprados disponibles. Puede quedar apenas negativo por el
  -- último mensaje; la próxima compra lo cubre.
  extra_balance numeric(12, 2) NOT NULL DEFAULT 0,
  -- Avisos al administrador (uno por mes de cada uno).
  low_alert_month date,
  out_alert_month date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lo consumido en lo que va del mes cuenta para el plan de este mes.
INSERT INTO public.commercial_ai_wallets (organization_id, month, month_used)
SELECT u.organization_id,
  date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))::date,
  sum(u.credits)
FROM public.commercial_ai_usage u
WHERE timezone('America/Argentina/Buenos_Aires', u.created_at)
  >= date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))
GROUP BY u.organization_id
ON CONFLICT (organization_id) DO NOTHING;

-- 4) Movimientos de créditos comprados (compras y ajustes), para auditar.
CREATE TABLE IF NOT EXISTS public.commercial_ai_credit_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('compra', 'ajuste')),
  credits numeric(12, 2) NOT NULL,
  note text NOT NULL DEFAULT '',
  purchase_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_ai_credit_movements_org_idx
  ON public.commercial_ai_credit_movements (organization_id, created_at DESC);

-- 5) Paquetes a la venta. Precio en dólares, más IVA; se cobra en pesos al
-- dólar oficial del día.
CREATE TABLE IF NOT EXISTS public.commercial_ai_credit_packages (
  key text PRIMARY KEY,
  name text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  price_usd numeric(10, 2) NOT NULL CHECK (price_usd > 0),
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0
);
INSERT INTO public.commercial_ai_credit_packages (key, name, credits, price_usd, sort) VALUES
  ('inicial', 'Inicial', 1000, 38, 1),
  ('equipo', 'Equipo', 5000, 160, 2),
  ('empresa', 'Empresa', 20000, 600, 3)
ON CONFLICT (key) DO NOTHING;

-- 6) Compras con Mercado Pago.
CREATE TABLE IF NOT EXISTS public.commercial_ai_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_key text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  price_usd numeric(10, 2) NOT NULL,
  ars_per_usd numeric(12, 4) NOT NULL,
  net_ars numeric(14, 2) NOT NULL,
  vat_ars numeric(14, 2) NOT NULL,
  total_ars numeric(14, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  mp_preference_id text,
  mp_payment_id text UNIQUE,
  mp_status text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS commercial_ai_credit_purchases_org_idx
  ON public.commercial_ai_credit_purchases (organization_id, created_at DESC);

ALTER TABLE public.commercial_ai_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_credit_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_ai_wallets read" ON public.commercial_ai_wallets;
CREATE POLICY "commercial_ai_wallets read" ON public.commercial_ai_wallets
  FOR SELECT USING (public.can_use_commercial_ai(organization_id));
DROP POLICY IF EXISTS "commercial_ai_credit_movements read" ON public.commercial_ai_credit_movements;
CREATE POLICY "commercial_ai_credit_movements read" ON public.commercial_ai_credit_movements
  FOR SELECT USING (public.can_manage_commercial_ai(organization_id));
DROP POLICY IF EXISTS "commercial_ai_credit_packages read" ON public.commercial_ai_credit_packages;
CREATE POLICY "commercial_ai_credit_packages read" ON public.commercial_ai_credit_packages
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "commercial_ai_credit_purchases read" ON public.commercial_ai_credit_purchases;
CREATE POLICY "commercial_ai_credit_purchases read" ON public.commercial_ai_credit_purchases
  FOR SELECT USING (public.can_manage_commercial_ai(organization_id));

GRANT SELECT ON public.commercial_ai_wallets, public.commercial_ai_credit_movements,
  public.commercial_ai_credit_packages, public.commercial_ai_credit_purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_wallets,
  public.commercial_ai_credit_movements, public.commercial_ai_credit_packages,
  public.commercial_ai_credit_purchases TO service_role;

-- 7) Descontar créditos (atómico). Primero del plan del mes; lo que pasa,
-- de los comprados. Devuelve lo que queda disponible después.
CREATE OR REPLACE FUNCTION public.commercial_ai_charge_credits(
  p_org uuid,
  p_credits numeric,
  p_included numeric
)
RETURNS TABLE (month_used numeric, extra_balance numeric, available numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_wallet public.commercial_ai_wallets%ROWTYPE;
  v_plan_left numeric;
  v_from_extra numeric;
BEGIN
  INSERT INTO public.commercial_ai_wallets (organization_id, month)
    VALUES (p_org, v_month)
    ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.commercial_ai_wallets w
    WHERE w.organization_id = p_org FOR UPDATE;
  IF v_wallet.month <> v_month THEN
    v_wallet.month := v_month;
    v_wallet.month_used := 0;
  END IF;
  v_plan_left := greatest(p_included - v_wallet.month_used, 0);
  v_from_extra := greatest(p_credits - v_plan_left, 0);
  UPDATE public.commercial_ai_wallets w SET
    month = v_wallet.month,
    month_used = v_wallet.month_used + p_credits,
    extra_balance = w.extra_balance - v_from_extra,
    updated_at = now()
  WHERE w.organization_id = p_org
  RETURNING w.month_used, w.extra_balance INTO v_wallet.month_used, v_wallet.extra_balance;
  RETURN QUERY SELECT v_wallet.month_used, v_wallet.extra_balance,
    greatest(p_included - v_wallet.month_used, 0) + v_wallet.extra_balance;
END;
$$;

-- 8) Sumar créditos comprados (compra aprobada o ajuste de un superadmin).
-- Una compra se acredita una sola vez aunque Mercado Pago avise varias.
CREATE OR REPLACE FUNCTION public.commercial_ai_add_credits(
  p_org uuid,
  p_credits numeric,
  p_kind text,
  p_note text,
  p_purchase uuid,
  p_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_purchase IS NOT NULL THEN
    UPDATE public.commercial_ai_credit_purchases
      SET status = 'aprobada', approved_at = now()
      WHERE id = p_purchase AND organization_id = p_org AND status <> 'aprobada';
    IF NOT FOUND THEN
      RETURN false;
    END IF;
  END IF;
  INSERT INTO public.commercial_ai_wallets (organization_id)
    VALUES (p_org)
    ON CONFLICT (organization_id) DO NOTHING;
  UPDATE public.commercial_ai_wallets
    SET extra_balance = extra_balance + p_credits, updated_at = now()
    WHERE organization_id = p_org;
  INSERT INTO public.commercial_ai_credit_movements
    (organization_id, kind, credits, note, purchase_id, created_by)
    VALUES (p_org, p_kind, p_credits, coalesce(p_note, ''), p_purchase, p_by);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_ai_charge_credits(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commercial_ai_add_credits(uuid, numeric, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_ai_charge_credits(uuid, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_ai_add_credits(uuid, numeric, text, text, uuid, uuid) TO service_role;
