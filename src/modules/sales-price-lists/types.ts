import type { Database } from "@/types/supabase";

export type SalesPriceListStatus = "Active" | "Scheduled" | "Archived";
export type SalesPriceListType = "PERCENTAGE" | "PRICE";

export type SalesPriceList = Omit<
  Database["public"]["Tables"]["sales_price_lists"]["Row"],
  "is_target_margin" | "extra_commission_rate"
> & {
  status?: SalesPriceListStatus;
  type: SalesPriceListType;
  value: number;
  is_target_margin?: boolean;
  extra_commission_rate?: number | null;
};

export type CreateSalesPriceListInput = {
  orgSlug: string;
  name: string;
  type: SalesPriceListType;
  value: number;
  valid_from: string;
  is_active?: boolean;
  notes?: string | null;
};

export type UpdateSalesPriceListInput = Omit<
  CreateSalesPriceListInput,
  "orgSlug"
>;
