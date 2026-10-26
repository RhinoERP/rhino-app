-- Commit the new enum value before any function starts using it.
alter type public.purchase_order_status add value if not exists 'PARTIALLY_RECEIVED';
