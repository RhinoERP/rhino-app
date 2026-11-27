import type { SalesAccessContext } from "@/modules/sales/service/sales.service";

export function canOpenCustomerSale(
  sale: { user_id: string | null },
  access: Pick<SalesAccessContext, "canRead" | "scope" | "userId">
): boolean {
  return (
    access.canRead &&
    (access.scope === "all" ||
      (access.userId != null && sale.user_id === access.userId))
  );
}
