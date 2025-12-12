import type { Database } from "@/types/supabase";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductLot = Database["public"]["Tables"]["product_lots"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

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
