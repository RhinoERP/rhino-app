"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrgSettings } from "../service/org-settings.service";

const orgSettingsQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "settings"] as const;

export function useOrgSettings(orgSlug: string) {
  return useQuery<OrgSettings>({
    queryKey: orgSettingsQueryKey(orgSlug),
    queryFn: async () => {
      const res = await fetch(`/api/org/${orgSlug}/settings`);
      if (!res.ok) {
        throw new Error("Failed to fetch org settings");
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
