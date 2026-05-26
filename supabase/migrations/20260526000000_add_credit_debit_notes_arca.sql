-- ============================================================
-- Migration: Credit/Debit Notes ARCA + IIBB Tax Infrastructure
-- ============================================================

-- 1. Extend invoice_type enum with credit and debit note types
-- PostgreSQL does not support IF NOT EXISTS for enum values
-- so we check pg_enum before adding each value.

DO $$
BEGIN
  -- Notas de Crédito
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'NOTA_DE_CREDITO_A'
      AND enumtypid = 'public.invoice_type'::regtype
  ) THEN
    ALTER TYPE public.invoice_type ADD VALUE 'NOTA_DE_CREDITO_A';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'NOTA_DE_CREDITO_B'
      AND enumtypid = 'public.invoice_type'::regtype
  ) THEN
    ALTER TYPE public.invoice_type ADD VALUE 'NOTA_DE_CREDITO_B';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'NOTA_DE_CREDITO_C'
      AND enumtypid = 'public.invoice_type'::regtype
  ) THEN
    ALTER TYPE public.invoice_type ADD VALUE 'NOTA_DE_CREDITO_C';
  END IF;

  -- Notas de Débito
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'NOTA_DE_DEBITO_A'
      AND enumtypid = 'public.invoice_type'::regtype
  ) THEN
    ALTER TYPE public.invoice_type ADD VALUE 'NOTA_DE_DEBITO_A';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'NOTA_DE_DEBITO_B'
      AND enumtypid = 'public.invoice_type'::regtype
  ) THEN
    ALTER TYPE public.invoice_type ADD VALUE 'NOTA_DE_DEBITO_B';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'NOTA_DE_DEBITO_C'
      AND enumtypid = 'public.invoice_type'::regtype
  ) THEN
    ALTER TYPE public.invoice_type ADD VALUE 'NOTA_DE_DEBITO_C';
  END IF;
END
$$;

-- 2. Add ARCA emission fields to credit_notes
--    (mirrors the structure in sales_orders)

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS arca_status          text          NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS arca_cae             text,
  ADD COLUMN IF NOT EXISTS arca_cae_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS arca_authorized_at   timestamptz,
  ADD COLUMN IF NOT EXISTS arca_point_of_sale   integer,
  ADD COLUMN IF NOT EXISTS arca_voucher_number  integer,
  ADD COLUMN IF NOT EXISTS arca_voucher_type_code integer,
  ADD COLUMN IF NOT EXISTS arca_last_error      text,
  ADD COLUMN IF NOT EXISTS arca_request_json    jsonb,
  ADD COLUMN IF NOT EXISTS arca_response_json   jsonb,
  -- Original invoice linkage (required for CbtesAsoc in WSFE)
  ADD COLUMN IF NOT EXISTS assoc_invoice_type_code  integer,
  ADD COLUMN IF NOT EXISTS assoc_invoice_point_of_sale integer,
  ADD COLUMN IF NOT EXISTS assoc_invoice_number      integer;

-- 3. Create debit_notes table
--    Mirrors credit_notes structure, adds ARCA fields from the start.

CREATE TABLE IF NOT EXISTS public.debit_notes (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_order_id        uuid          REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  customer_id           uuid          NOT NULL REFERENCES public.customers(id),
  invoice_type          public.invoice_type NOT NULL DEFAULT 'NOTA_DE_DEBITO_B',

  -- Issue information
  issue_date            date          NOT NULL DEFAULT now(),
  debit_note_number     text,
  amount                numeric(12,2) NOT NULL CHECK (amount > 0),
  observations          text,

  -- Status
  status                text          NOT NULL DEFAULT 'CONFIRMED'
                          CHECK (status IN ('CONFIRMED', 'CANCELLED')),

  -- ARCA fields
  arca_status           text          NOT NULL DEFAULT 'not_requested',
  arca_cae              text,
  arca_cae_expires_at   timestamptz,
  arca_authorized_at    timestamptz,
  arca_point_of_sale    integer,
  arca_voucher_number   integer,
  arca_voucher_type_code integer,
  arca_last_error       text,
  arca_request_json     jsonb,
  arca_response_json    jsonb,

  -- Original invoice linkage
  assoc_invoice_type_code       integer,
  assoc_invoice_point_of_sale   integer,
  assoc_invoice_number          integer,

  -- Audit
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_debit_notes_updated_at ON public.debit_notes;
CREATE TRIGGER set_debit_notes_updated_at
  BEFORE UPDATE ON public.debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Auto-numbering for debit notes
--    Uses same sequence pattern as credit_notes if they have one.
--    If credit_notes uses a different mechanism, adapt accordingly.

CREATE SEQUENCE IF NOT EXISTS public.debit_note_number_seq START 1;

-- 5. Add index for common queries
CREATE INDEX IF NOT EXISTS idx_debit_notes_organization_id
  ON public.debit_notes (organization_id);

CREATE INDEX IF NOT EXISTS idx_debit_notes_customer_id
  ON public.debit_notes (customer_id);

CREATE INDEX IF NOT EXISTS idx_debit_notes_sales_order_id
  ON public.debit_notes (sales_order_id);

CREATE INDEX IF NOT EXISTS idx_credit_notes_arca_status
  ON public.credit_notes (arca_status);

-- 6. RLS policies for debit_notes
ALTER TABLE public.debit_notes ENABLE ROW LEVEL SECURITY;

-- Allow org members to read their own debit notes
CREATE POLICY "org_members_read_debit_notes"
  ON public.debit_notes FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow org members to insert
CREATE POLICY "org_members_insert_debit_notes"
  ON public.debit_notes FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow org members to update
CREATE POLICY "org_members_update_debit_notes"
  ON public.debit_notes FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 7. Add new ArcaTaxCode values to the taxes table check constraint if any
--    (No change needed — taxes.code is a free-text field validated at app level)

COMMENT ON TABLE public.debit_notes IS
  'Notas de Débito emitidas por la organización. Pueden estar vinculadas a una venta y/o emitidas fiscalmente en ARCA.';

COMMENT ON COLUMN public.credit_notes.assoc_invoice_type_code IS
  'CbteTipo del comprobante original (requerido por WSFE en CbtesAsoc). Ej: 1=Factura A, 6=Factura B.';

COMMENT ON COLUMN public.credit_notes.assoc_invoice_number IS
  'Número del comprobante original (CbteNro) en WSFE.';
