import type { Database } from "@/types/supabase";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductLot = Database["public"]["Tables"]["product_lots"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type StockMovementType =
  Database["public"]["Enums"]["stock_movement_type"];

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

export type ProductDetail = {
  product: Product;
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  totalStock: number;
};

export type ProductLotWithStatus = ProductLot & {
  isExpired: boolean;
  expiresInDays: number | null;
};

export type StockMovementWithLot = {
  id: string;
  lot_id: string;
  lot_number: string;
  lot_expiration_date: string | null;
  type: StockMovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  created_at: string | null;
};
