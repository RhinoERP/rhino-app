import type { PosPaymentMethod } from "@/modules/pos/types";
import type { InvoiceType } from "@/modules/sales/types";
import type { Database } from "@/types/supabase";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type SalesDefaultPaymentMethod = PosPaymentMethod;
export type SalesDefaultInvoiceType = InvoiceType;

export type DirectSaleConfig = {
  direct_sale_tax_id: string | null;
  direct_sale_tax_ids: string[];
  direct_sale_markup_percentage: number;
  sales_enabled_payment_methods: SalesDefaultPaymentMethod[];
  sales_default_payment_method: SalesDefaultPaymentMethod;
  sales_default_invoice_type: SalesDefaultInvoiceType;
  non_invoiced_payment_methods: SalesDefaultPaymentMethod[];
};

export type UpdateDirectSaleConfigInput = {
  directSaleTaxId: string | null;
  directSaleTaxIds: string[];
  directSaleMarkupPercentage: number;
  salesEnabledPaymentMethods: SalesDefaultPaymentMethod[];
  salesDefaultPaymentMethod: SalesDefaultPaymentMethod;
  salesDefaultInvoiceType: SalesDefaultInvoiceType;
  nonInvoicedPaymentMethods: SalesDefaultPaymentMethod[];
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
