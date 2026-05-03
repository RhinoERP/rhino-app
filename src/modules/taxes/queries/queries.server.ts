import { taxesQueryKey } from "@/modules/taxes/queries/query-keys";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

export const taxesServerQueryOptions = (orgSlug: string) => ({
  queryKey: taxesQueryKey(orgSlug),
  queryFn: () => getActiveTaxesByOrgSlug(orgSlug),
});
