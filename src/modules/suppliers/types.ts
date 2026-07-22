import type { Database } from "@/types/supabase";

export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

export type SupplierPurchase = {
  id: string;
  purchase_number: number | null;
  status: Database["public"]["Enums"]["purchase_order_status"];
  purchase_date: string;
  delivery_date: string | null;
  total_amount: number;
};

export type SupplierStats = {
  totalPurchases: number;
  totalAmount: number;
};

export type SupplierWithStats = Supplier & {
  stats: SupplierStats;
  recentPurchases: SupplierPurchase[];
};
