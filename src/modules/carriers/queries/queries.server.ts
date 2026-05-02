import { getActiveCarriersByOrgSlug } from "../service/carriers.service";
import { carriersQueryKey } from "./query-keys";

export const carriersServerQueryOptions = (orgSlug: string) => ({
  queryKey: carriersQueryKey(orgSlug),
  queryFn: () => getActiveCarriersByOrgSlug(orgSlug),
});
