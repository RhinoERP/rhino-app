ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS route_sheets_enabled boolean NOT NULL DEFAULT false;
