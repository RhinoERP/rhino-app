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

// Pagination types
export type SortParam = {
  id: string;
  desc: boolean;
};

export type CustomerPaginatedParams = {
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  status?: string;
  sellerId?: string;
};

export type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type CustomerMetrics = {
  totalCustomers: number;
  activeCustomers: number;
  archivedCustomers: number;
};
