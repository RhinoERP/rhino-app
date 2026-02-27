"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { customersClientQueryOptions } from "../queries/queries.client";
import type { CustomerStatusFilter } from "../service/customers.service";
import type { Customer } from "../types";

export function useCustomers(
  orgSlug: string,
  status: CustomerStatusFilter = "active"
) {
  return useSuspenseQuery<Customer[]>(
    customersClientQueryOptions(orgSlug, status)
  );
}
