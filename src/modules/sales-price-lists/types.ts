// Sales Price Lists Types
// Note: These types should be updated once the database schema is finalized
// and the Supabase types are regenerated

export type SalesPriceListStatus = "Active" | "Scheduled" | "Archived";

export type SalesPriceList = {
  id: string;
  organization_id: string;
  name: string;
  percentage: number;
  valid_from: string;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
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
