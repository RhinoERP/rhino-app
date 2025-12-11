"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { suppliersClientQueryOptions } from "../queries/queries.client";
import type { Supplier } from "../service/suppliers.service";

export function useSuppliers(orgSlug: string) {
  return useSuspenseQuery<Supplier[]>(suppliersClientQueryOptions(orgSlug));
}
