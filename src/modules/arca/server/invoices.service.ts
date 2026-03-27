import "server-only";

import {
  getSalesOrdersByOrgSlug,
  type SalesOrderWithCustomer,
} from "@/modules/sales/service/sales.service";

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export async function getAuthorizedArcaInvoicesByOrgSlug(
  orgSlug: string
): Promise<SalesOrderWithCustomer[]> {
  const sales = await getSalesOrdersByOrgSlug(orgSlug);

  return sales
    .filter((sale) => sale.arca_status === "authorized")
    .sort(
      (a, b) =>
        toTimestamp(b.arca_authorized_at) - toTimestamp(a.arca_authorized_at)
    );
}
