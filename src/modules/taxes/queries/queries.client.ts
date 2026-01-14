import type { Tax } from "../service/taxes.service";
import { taxesQueryKey } from "./query-keys";

export const taxesClientQueryOptions = (orgSlug: string) => ({
  queryKey: taxesQueryKey(orgSlug),
  queryFn: async (): Promise<Tax[]> => {
    const res = await fetch(`/api/org/${orgSlug}/impuestos`);
    if (!res.ok) {
      throw new Error("Failed to fetch taxes");
    }
    return res.json();
  },
});
