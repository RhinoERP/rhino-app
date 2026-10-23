ALTER TABLE order_dispatch_events
  ADD COLUMN IF NOT EXISTS remittance_pdf_url TEXT;
