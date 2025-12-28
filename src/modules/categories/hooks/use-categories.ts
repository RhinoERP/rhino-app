"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { categoriesClientQueryOptions } from "../queries/queries.client";
import type { Category } from "../types";

export function useCategories(orgSlug: string) {
  return useSuspenseQuery<Category[]>(categoriesClientQueryOptions(orgSlug));
}
