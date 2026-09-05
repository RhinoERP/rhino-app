-- Fase 2 — Comisiones por proveedor (matriz vendedor × proveedor)
-- Parte del rediseño listas-precio-comisiones v2 (ver /listas-y-comisiones.md)
--
-- Gating: solo organizaciones con supplier_differentiated_credits = true
-- (además de commissions_enabled). El gating se valida en el código (service/actions).

-- 1. Matriz de tasas vendedor × proveedor
CREATE TABLE IF NOT EXISTS seller_supplier_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  rate numeric(5,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, seller_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_ssc_org ON seller_supplier_commissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ssc_org_seller ON seller_supplier_commissions(organization_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_ssc_org_supplier ON seller_supplier_commissions(organization_id, supplier_id);

-- 2. Trazabilidad: snapshot de la tasa del proveedor en la fila de comisión
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS supplier_commission_rate numeric(5,2) NOT NULL DEFAULT 0;