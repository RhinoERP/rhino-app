import type { Customer } from "../types";
import { customersQueryKey } from "./query-keys";

export const customersClientQueryOptions = (orgSlug: string) => ({
  queryKey: customersQueryKey(orgSlug),
  queryFn: async (): Promise<Customer[]> => {
    const res = await fetch(`/api/org/${orgSlug}/clientes`);
    if (!res.ok) {
      throw new Error("Failed to fetch customers");
    }
    return res.json();
  },
});
