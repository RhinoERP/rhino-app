import type { Tax } from "../service/taxes.service";
import { taxesQueryKey } from "./query-keys";

export const taxesClientQueryOptions = () => ({
  queryKey: taxesQueryKey(),
  queryFn: async (): Promise<Tax[]> => {
    const res = await fetch("/api/taxes");
    if (!res.ok) {
      throw new Error("Failed to fetch taxes");
    }
    return res.json();
  },
});
