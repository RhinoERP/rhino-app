"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { customersClientQueryOptions } from "../queries/queries.client";
import type { Customer } from "../types";

export function useCustomers(orgSlug: string) {
  return useSuspenseQuery<Customer[]>(customersClientQueryOptions(orgSlug));
}
