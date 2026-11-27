"use server";

import { z } from "zod";
import type { PurchaseHistoryFilters } from "../chess-history";
import { getPurchaseHistoryExport } from "../service/chess-purchase-history.service";

export async function exportChessPurchasesAction(
  orgSlug: string,
  scope: "filtered" | "all",
  filters: PurchaseHistoryFilters,
  offset = 0
) {
  z.enum(["filtered", "all"]).parse(scope);
  return await getPurchaseHistoryExport(
    orgSlug,
    scope === "all" ? {} : filters,
    offset
  );
}
