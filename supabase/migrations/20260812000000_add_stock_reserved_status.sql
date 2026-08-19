DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'STOCK_RESERVED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_flow_status')
  ) THEN
    ALTER TYPE order_flow_status ADD VALUE 'STOCK_RESERVED';
  END IF;
END $$;
