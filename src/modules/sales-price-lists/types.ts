import type { Database } from "@/types/supabase";

export type SalesPriceListStatus = "Active" | "Scheduled" | "Archived";

export type SalesPriceList =
  Database["public"]["Tables"]["sales_price_lists"]["Row"] & {
    status?: SalesPriceListStatus;
  };

export type CreateSalesPriceListInput = {
  orgSlug: string;
  name: string;
  percentage: number;
  valid_from: string;
  is_active?: boolean;
  notes?: string | null;
};

export type UpdateSalesPriceListInput = Omit<
  CreateSalesPriceListInput,
  "orgSlug"
>;
