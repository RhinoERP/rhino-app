import type { CustomerStatusFilter } from "../service/customers.service";
import type { Customer } from "../types";
import { customersQueryKey } from "./query-keys";

export const customersClientQueryOptions = (
  orgSlug: string,
  status: CustomerStatusFilter = "active"
) => ({
  queryKey: customersQueryKey(orgSlug, status),
  queryFn: async (): Promise<Customer[]> => {
    const res = await fetch(`/api/org/${orgSlug}/clientes?status=${status}`);
    if (!res.ok) {
      throw new Error("Failed to fetch customers");
    }
    return res.json();
  },
});
