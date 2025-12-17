// Price Lists Types
// Note: These types should be updated once the database schema is finalized
// and the Supabase types are regenerated

export type PriceListStatus = "Active" | "Scheduled" | "Archived";

export type PriceList = {
  id: string;
  supplier_id: string;
  name: string;
  valid_from: string;
  status: PriceListStatus;
  // Optional fields (not in view, but may be needed for detail pages)
  created_at?: string;
  updated_at?: string;
  // Joined data
  supplier_name?: string;
};

export type PriceListItem = {
  id: string;
  price_list_id: string;
  product_id: string;
  sku: string;
  price: number;
  created_at: string;
  // Joined data
  product_name?: string;
};

export type PriceListWithItems = PriceList & {
  items: PriceListItem[];
};

export type ImportPriceListItem = {
  sku: string;
  price: number;
};

export type ImportPriceListResult = {
  price_list_id: string;
  imported_count: number;
  is_active: boolean;
  missing_skus: string[];
};
