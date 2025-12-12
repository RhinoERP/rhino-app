// Price Lists Types
// Note: These types should be updated once the database schema is finalized
// and the Supabase types are regenerated

export type PriceListStatus = "active" | "future" | "expired";

export type PriceList = {
  id: string;
  organization_id: string;
  supplier_id: string;
  name: string;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  supplier_name?: string;
};

export type PriceListItem = {
  id: string;
  price_list_id: string;
  product_id: string;
  sku: string;
  price: number;
  profit_margin?: number | null;
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
  profit_margin?: number;
};

export type ImportPriceListResult = {
  price_list_id: string;
  imported_count: number;
  updated_products_count: number;
  is_active: boolean;
  missing_skus: string[];
};
