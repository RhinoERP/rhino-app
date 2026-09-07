import type { Database } from "@/types/supabase";

export type PriceLevel = Database["public"]["Tables"]["price_levels"]["Row"];

export type PriceLevelStatus = "Active" | "Scheduled" | "Archived";

export type PriceLevelWithStatus = PriceLevel & {
  status?: PriceLevelStatus;
};

export type CreatePriceLevelInput = {
  orgSlug: string;
  name: string;
  margin: number;
  extraCommissionRate?: number;
  validFrom?: string | null;
  isActive?: boolean;
};

export type UpdatePriceLevelInput = Omit<CreatePriceLevelInput, "orgSlug">;
