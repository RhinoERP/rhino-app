import { getActiveTaxesByOrgSlug } from "../service/taxes.service";
import { taxesQueryKey } from "./query-keys";

export const taxesServerQueryOptions = (orgSlug: string) => ({
  queryKey: taxesQueryKey(orgSlug),
  queryFn: () => getActiveTaxesByOrgSlug(orgSlug),
});
