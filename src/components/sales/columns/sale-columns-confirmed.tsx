"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { createSalesColumns } from "./sale-columns-all";

export function createConfirmedSalesColumns(
  orgSlug: string,
  customerOptions: Array<{ label: string; value: string }> = [],
  sellerOptions: Array<{ label: string; value: string }> = []
): ColumnDef<SalesOrderWithCustomer>[] {
  return createSalesColumns(orgSlug, customerOptions, sellerOptions, false);
}
