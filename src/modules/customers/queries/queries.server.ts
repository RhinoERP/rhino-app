import { getCustomersByOrgSlug } from "../service/customers.service";
import { customersQueryKey } from "./query-keys";

export const customersServerQueryOptions = (orgSlug: string) => ({
  queryKey: customersQueryKey(orgSlug),
  queryFn: () => getCustomersByOrgSlug(orgSlug),
});
