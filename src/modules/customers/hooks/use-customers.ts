"use client";

import { useQuery } from "@tanstack/react-query";
import { customersClientQueryOptions } from "../queries/queries.client";
import type { CustomerStatusFilter } from "../service/customers.service";
import type { Customer } from "../types";

export function useCustomers(
  orgSlug: string,
  status: CustomerStatusFilter = "active",
  initialData: Customer[] = []
) {
  return useQuery<Customer[]>({
    ...customersClientQueryOptions(orgSlug, status),
    initialData,
  });
}
