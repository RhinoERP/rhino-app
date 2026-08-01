import type { QueryBuilder } from "@/lib/query-builder";
import type { SalesPaginatedParams } from "../types";

export function applySalesDateFilters<T extends QueryBuilder>(
  query: T,
  params: SalesPaginatedParams
): T {
  let q: QueryBuilder = query;

  if (params.confirmedAt?.from) {
    q = q.gte("confirmed_at", params.confirmedAt.from);
  }
  if (params.confirmedAt?.to) {
    q = q.lte("confirmed_at", params.confirmedAt.to);
  }
  if (params.dispatchedAt?.from) {
    q = q.gte("dispatched_at", params.dispatchedAt.from);
  }
  if (params.dispatchedAt?.to) {
    q = q.lte("dispatched_at", params.dispatchedAt.to);
  }
  if (params.deliveredAt?.from) {
    q = q.gte("delivered_at", params.deliveredAt.from);
  }
  if (params.deliveredAt?.to) {
    q = q.lte("delivered_at", params.deliveredAt.to);
  }
  if (params.cancelledAt?.from) {
    q = q.gte("cancelled_at", params.cancelledAt.from);
  }
  if (params.cancelledAt?.to) {
    q = q.lte("cancelled_at", params.cancelledAt.to);
  }
  if (params.expirationDate?.from) {
    q = q.gte("expiration_date", params.expirationDate.from);
  }
  if (params.expirationDate?.to) {
    q = q.lte("expiration_date", params.expirationDate.to);
  }

  return q as T;
}
