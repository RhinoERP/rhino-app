import type { QueryBuilder } from "@/lib/query-builder";
import type { PaginationParams } from "../types";

export function applyFilters<T extends QueryBuilder>(
  query: T,
  params: PaginationParams
): T {
  let q: QueryBuilder = query;

  if (params.estado && params.estado !== "ALL") {
    q = q.eq("status", params.estado);
  }
  if (params.supplierId) {
    q = q.eq("supplier_id", params.supplierId);
  }

  for (const [col, range] of [
    ["in_transit_at", params.inTransitAt],
    ["received_at", params.receivedAt],
    ["cancelled_at", params.cancelledAt],
  ] as const) {
    if (range?.from) {
      q = q.gte(col, range.from);
    }
    if (range?.to) {
      q = q.lte(col, range.to);
    }
  }

  if (params.search) {
    const num = Number(params.search);
    if (Number.isNaN(num)) {
      q = q.ilike("remittance_number", `%${params.search}%`);
    } else {
      q = q.or(`purchase_number.eq.${num},remittance_number.eq.${num}`);
    }
  }

  return q as T;
}
