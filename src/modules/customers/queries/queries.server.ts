import type { CustomerStatusFilter } from "../service/customers.service";
import { getVisibleCustomersByOrgSlug } from "../service/customers.service";
import { customersQueryKey } from "./query-keys";

export const customersServerQueryOptions = (
  orgSlug: string,
  status: CustomerStatusFilter = "active"
) => ({
  queryKey: customersQueryKey(orgSlug, status),
  queryFn: () => getVisibleCustomersByOrgSlug(orgSlug, status),
});
