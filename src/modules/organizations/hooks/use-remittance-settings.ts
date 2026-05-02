"use client";

import { useQuery } from "@tanstack/react-query";
import { getRemittanceSettings } from "../actions/get-remittance-settings.action";

export function useRemittanceSettings(orgSlug: string) {
  const { data } = useQuery({
    queryKey: ["remittance-settings", orgSlug],
    queryFn: () => getRemittanceSettings(orgSlug),
    staleTime: 5 * 60 * 1000,
  });

  return data?.success ? data.data : null;
}
