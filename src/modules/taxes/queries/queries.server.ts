import { getActiveTaxes } from "../service/taxes.service";
import { taxesQueryKey } from "./query-keys";

export const taxesServerQueryOptions = () => ({
  queryKey: taxesQueryKey(),
  queryFn: () => getActiveTaxes(),
});
