ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS accounting_enabled boolean NOT NULL DEFAULT false;

UPDATE organizations 
SET accounting_enabled = true 
WHERE id IN (
  SELECT organization_id 
  FROM organization_settings 
  WHERE (settings->>'accounting_integration_enabled')::boolean = true
);
