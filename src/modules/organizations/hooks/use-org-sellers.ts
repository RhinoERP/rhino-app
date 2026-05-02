"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getOrgSellersAction,
  type SellerOption,
} from "../actions/get-sellers.action";

export function useOrgSellers(orgSlug: string) {
  return useQuery<SellerOption[]>({
    queryKey: ["org-sellers", orgSlug],
    queryFn: () => getOrgSellersAction(orgSlug),
    staleTime: 5 * 60 * 1000,
  });
}
