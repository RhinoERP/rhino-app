-- Add DRAFT status to purchase_order_status enum
-- Used for pre-purchases created from child orders (route: "purchase")

ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'DRAFT';

-- Allow null supplier_id for DRAFT pre-compras (no proveedor asignado aún)
ALTER TABLE purchase_orders ALTER COLUMN supplier_id DROP NOT NULL;
