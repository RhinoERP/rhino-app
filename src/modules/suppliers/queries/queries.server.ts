import { getSuppliersByOrgSlug } from "../service/suppliers.service";
import { suppliersQueryKey } from "./query-keys";

export const suppliersServerQueryOptions = (orgSlug: string) => ({
  queryKey: suppliersQueryKey(orgSlug),
  queryFn: () => getSuppliersByOrgSlug(orgSlug),
});
