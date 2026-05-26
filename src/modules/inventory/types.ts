import type { Database } from "@/types/supabase";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type DirectSalePrice =
  Database["public"]["Tables"]["direct_sale_prices"]["Row"];
export type ProductLot = Database["public"]["Tables"]["product_lots"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type StockMovementType =
  Database["public"]["Enums"]["stock_movement_type"];
export type StockMovementDisplayType = StockMovementType | "POS_SALE";

/**
 * Product with current price information from the active price list.
 * This type represents the products_with_price view.
 */
export type ProductWithPrice =
  Database["public"]["Views"]["products_with_price"]["Row"];

/**
 * Represents an aggregated stock item for the inventory view.
 * Uses the view_stock_detail database view which includes category and supplier names.
 */
export type StockItem =
  Database["public"]["Views"]["view_stock_detail"]["Row"] & {
    // Ensure required fields are non-nullable for the UI
    product_id: string;
    sku: string;
    product_name: string;
    total_stock: number;
    is_active: boolean;
    total_unit_stock?: number | null;
    unit_of_measure?:
      | Database["public"]["Enums"]["unit_of_measure_type"]
      | null;
    tracks_stock_units?: boolean | null;
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
  totalUnitStock: number | null;
  costPrice: number | null;
  salePrice: number | null;
};

export type DirectSaleTemplateProduct = {
  id: string;
  sku: string;
  name: string;
  costPrice: number | null;
};

export type ProductLotWithStatus = ProductLot & {
  isExpired: boolean;
  expiresInDays: number | null;
  hasSalesReferences: boolean;
  soldQuantityFromSales: number;
  soldUnitQuantityFromSales: number | null;
};

export type StockMovementWithLot = {
  id: string;
  lot_id: string;
  lot_number: string;
  lot_expiration_date: string | null;
  type: StockMovementDisplayType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  unit_quantity: number | null;
  unit_previous_stock?: number | null;
  unit_new_stock?: number | null;
  reason: string | null;
  created_at: string | null;
};
