import type { Database } from "@/types/supabase";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];

export type CustomerSale = {
  id: string;
  sale_number: number | null;
  status: Database["public"]["Enums"]["order_status"];
  sale_date: string;
  total_amount: number;
  invoice_type: Database["public"]["Enums"]["invoice_type"];
  invoice_number: string | null;
};

export type CustomerStats = {
  totalSales: number;
  totalAmount: number;
};

export type CustomerWithStats = Customer & {
  stats: CustomerStats;
  recentSales: CustomerSale[];
};
