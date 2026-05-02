"use client";

import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@/modules/customers/types";
import { directSaleCustomersClientQueryOptions } from "../queries/queries.client";

export function useDirectSaleCustomers(orgSlug: string) {
  return useQuery<Customer[]>(directSaleCustomersClientQueryOptions(orgSlug));
}
