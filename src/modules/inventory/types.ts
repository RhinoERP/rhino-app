import type { Database } from "@/types/supabase";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductLot = Database["public"]["Tables"]["product_lots"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

/**
 * Product with current price information from the active price list.
 * This type represents the products_with_price view.
 */
export type ProductWithPrice =
  Database["public"]["Views"]["products_with_price"]["Row"];

/**
 * Represents an aggregated stock item for the inventory view.
 * Combines product data with total available stock from all lots.
 */
export type StockItem = {
  product_id: string;
  sku: string;
  product_name: string;
  image_url: string | null;
  category_name: string | null;
  brand: string | null;
  supplier_name: string | null;
  total_stock: number;
  is_active: boolean;
  sale_price?: number | null;
  profit_margin?: number | null;
  cost_price?: number | null;
  active_price_list_id?: string | null;
  active_price_list_name?: string | null;
};

/**
 * Filter parameters for stock queries.
 */
export type StockFilters = {
  query?: string | null;
  supplier?: string | null;
  brand?: string | null;
  category?: string | null;
  status?: "active" | "inactive" | null;
};
