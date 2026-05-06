"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { createSalesColumns } from "./sale-columns-all";

type SalesColumnFilterOptions = {
  supplierOptions?: Array<{ label: string; value: string }>;
  carrierOptions?: Array<{ label: string; value: string }>;
};

export function createConfirmedSalesColumns(
  orgSlug: string,
  customerOptions: Array<{ label: string; value: string }> = [],
  sellerOptions: Array<{ label: string; value: string }> = [],
  filterOptions: SalesColumnFilterOptions = {}
): ColumnDef<SalesOrderWithCustomer>[] {
  return createSalesColumns({
    orgSlug,
    customerOptions,
    sellerOptions,
    supplierOptions: filterOptions.supplierOptions,
    includeStatusFilter: false,
    carrierOptions: filterOptions.carrierOptions,
  });
}
