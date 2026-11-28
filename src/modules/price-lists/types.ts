// Price Lists Types
import type {
  HabitualDiscounts,
  PurchaseDiscountMethod,
} from "@/modules/purchases/utils/purchase-discounts";
// Note: These types should be updated once the database schema is finalized
// and the Supabase types are regenerated

export type PriceListStatus = "Active" | "Scheduled" | "Archived" | "Inactive";

export type PriceList = {
  habitual_discount_method?: PurchaseDiscountMethod;
  id: string;
  supplier_id: string;
  name: string;
  valid_from: string;
  status: PriceListStatus;
  // Set when this list was replaced by a newer one (configurable price lists feature)
  replaced_by_list_id?: string | null;
  // Optional fields (not in view, but may be needed for detail pages)
  created_at?: string;
  updated_at?: string;
  // Joined data
  supplier_name?: string;
};

export type PriceListItem = HabitualDiscounts & {
  list_price?: number | null;
  id: string;
  price_list_id: string;
  product_id: string;
  sku: string;
  price: number;
  currency?: string;
  purchase_price?: number;
  product_margin?: number | null;
  calculated_sale_price?: number | null;
  created_at: string;
  // Joined data
  product_name?: string;
};

export type PriceListWithItems = PriceList & {
  items: PriceListItem[];
};

export type ImportPriceListItem = HabitualDiscounts & {
  sku: string;
  price: number;
  currency?: string;
};

export type ImportPriceListResult = {
  price_list_id: string;
  imported_count: number;
  is_active: boolean;
  missing_skus: string[];
};
