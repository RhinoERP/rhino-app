import type { Database } from "@/types/supabase";

export type CustomerSupplierAssignment =
  Database["public"]["Tables"]["customer_supplier_assignments"]["Row"] & {
    supplier_name?: string;
    price_list_name?: string;
    sales_price_list_name?: string;
  };

export type UpsertAssignmentInput = {
  customerId: string;
  supplierId: string;
  priceListId: string | null;
  salesPriceListId: string | null;
};
