import type { CustomerSite } from "@/modules/commercial-visits/contracts";
import type { Database } from "@/types/supabase";

export type RouteSheetStatus =
  Database["public"]["Enums"]["route_sheet_status"];

export type RouteSheet = Database["public"]["Tables"]["route_sheets"]["Row"];

export type RouteSheetSale = {
  id: string;
  customer_id: string;
  sale_number: number | null;
  customer_name: string;
  total_amount: number;
  remittance_number: string | null;
  status: Database["public"]["Enums"]["order_status"];
  user_id: string | null;
  dispatched_at: string | null;
  sale_date: string | null;
  carrier_id: string | null;
  preferred_carrier_id: string | null;
  customer_city: string | null;
  customer_delivery_city: string | null;
  customer_province: string | null;
  delivery_site_name: string | null;
  delivery_site_address: string | null;
  delivery_site_city: string | null;
};

export type RouteSheetWithSales = RouteSheet & {
  carrier: { id: string; name: string } | null;
  sales: RouteSheetSale[];
};

export type RouteSheetPageData = {
  routeSheets: RouteSheetWithSales[];
  availableSales: RouteSheetSale[];
  sites: CustomerSite[];
};

export type CreateRouteSheetInput = {
  orgSlug: string;
  carrierId: string;
  scheduledDate: string;
  notes?: string | null;
};

export type UpdateRouteSheetStatusInput = {
  orgSlug: string;
  routeSheetId: string;
  status: RouteSheetStatus;
};

export type AddSalesToRouteSheetInput = {
  orgSlug: string;
  routeSheetId: string;
  saleIds: string[];
  remittances: Record<string, string>;
  siteIds: Record<string, string>;
};

export type RemoveSaleFromRouteSheetInput = {
  orgSlug: string;
  routeSheetId: string;
  saleId: string;
};

export type DeleteRouteSheetInput = {
  orgSlug: string;
  routeSheetId: string;
};
