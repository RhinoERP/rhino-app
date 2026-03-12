import type { CustomerStatusFilter } from "../service/customers.service";

export const customersQueryKey = (
  orgSlug: string,
  status?: CustomerStatusFilter
) =>
  status
    ? (["org", orgSlug, "customers", status] as const)
    : (["org", orgSlug, "customers"] as const);
