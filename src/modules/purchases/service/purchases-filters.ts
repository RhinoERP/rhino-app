import type { QueryBuilder } from "@/lib/query-builder";
import type { PaginationParams } from "../types";

function applySupplierFilter(
  q: QueryBuilder,
  params: PaginationParams
): QueryBuilder {
  const ids: string[] = [];
  if (params.supplierIds && params.supplierIds.length > 0) {
    ids.push(...params.supplierIds);
  } else if (params.supplierId) {
    ids.push(params.supplierId);
  }
  if (ids.length > 0) {
    return q.in("supplier_id", ids as unknown as string[]);
  }
  return q;
}

export function applyFilters<T extends QueryBuilder>(
  query: T,
  params: PaginationParams
): T {
  let q: QueryBuilder = query;

  if (params.statusIds && params.statusIds.length > 0) {
    q = q.in("status", params.statusIds as unknown as string[]);
  } else if (params.estado && params.estado !== "ALL") {
    q = q.eq("status", params.estado);
  }
  q = applySupplierFilter(q, params);

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
