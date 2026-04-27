import type { Database } from "@/types/supabase";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export type DirectSaleConfig = {
  direct_sale_tax_id: string | null;
  direct_sale_markup_percentage: number;
};

export type UpdateDirectSaleConfigInput = {
  directSaleTaxId: string | null;
  directSaleMarkupPercentage: number;
};

export type UpsertDirectSalePriceInput = {
  productId: string;
  price: number;
};

export type OrganizationInvitationLookupResponse =
  Database["public"]["Functions"]["lookup_organization_invitation"]["Returns"] & {
    active: boolean;
    organization_name: string;
    invited_email: string | null;
    user_exists: boolean;
    user_id: string | null;
  };
