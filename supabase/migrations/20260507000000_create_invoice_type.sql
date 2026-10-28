DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'invoice_type'
  ) THEN
    CREATE TYPE public.invoice_type AS ENUM (
      'FACTURA_A',
      'FACTURA_B',
      'FACTURA_C',
      'NOTA_DE_VENTA',
      'FACTURA_E',
      'FACTURA_A_RETENCION',
      'NOTA_DE_CREDITO_A',
      'NOTA_DE_CREDITO_B',
      'NOTA_DE_CREDITO_C',
      'NOTA_DE_DEBITO_A',
      'NOTA_DE_DEBITO_B',
      'NOTA_DE_DEBITO_C'
    );
  END IF;
END
$$;