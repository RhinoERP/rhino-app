import { getCategoriesByOrgSlug } from "../service/categories.service";
import { categoriesQueryKey } from "./query-keys";

export const categoriesServerQueryOptions = (orgSlug: string) => ({
  queryKey: categoriesQueryKey(orgSlug),
  queryFn: () => getCategoriesByOrgSlug(orgSlug),
});
