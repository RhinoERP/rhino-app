-- Route Sheets Module: enum, table, column on sales_orders, indices, RLS

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE route_sheet_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabla route_sheets
CREATE TABLE IF NOT EXISTS route_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  carrier_id TEXT NOT NULL REFERENCES carriers(id),
  scheduled_date DATE NOT NULL,
  status route_sheet_status NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Columna en sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS route_sheet_id UUID REFERENCES route_sheets(id);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_route_sheets_org ON route_sheets(organization_id);
CREATE INDEX IF NOT EXISTS idx_route_sheets_carrier ON route_sheets(carrier_id);
CREATE INDEX IF NOT EXISTS idx_route_sheets_date ON route_sheets(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_route_sheets_status ON route_sheets(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_route_sheet ON sales_orders(route_sheet_id);

-- 5. RLS
ALTER TABLE route_sheets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY route_sheets_org_member_access ON route_sheets
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_members.organization_id = route_sheets.organization_id
          AND organization_members.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
