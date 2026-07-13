-- Add column to store the URL of the purchase order PDF file
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS purchase_order_file TEXT;

-- Also add to orders so it's readable without a JOIN
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS purchase_order_file TEXT;

-- Create storage bucket for purchase order files
-- Run this in the Supabase SQL editor or dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('purchase-orders', 'purchase-orders', true);
--
-- Then create policies for the bucket:
-- CREATE POLICY "Authenticated users can upload purchase orders"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'purchase-orders');
--
-- CREATE POLICY "Authenticated users can delete purchase orders"
--    ON storage.objects FOR DELETE TO authenticated
--    USING (bucket_id = 'purchase-orders');
--
-- CREATE POLICY "Public can view purchase orders"
--   ON storage.objects FOR SELECT TO public
--   USING (bucket_id = 'purchase-orders');
