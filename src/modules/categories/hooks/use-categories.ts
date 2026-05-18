"use client";

import { useQuery } from "@tanstack/react-query";
import { categoriesClientQueryOptions } from "../queries/queries.client";
import type { Category } from "../types";

export function useCategories(orgSlug: string) {
  return useQuery<Category[]>({
    ...categoriesClientQueryOptions(orgSlug),
    initialData: [],
  });
}
