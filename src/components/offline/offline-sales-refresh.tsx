"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  getSalesListOrgSlug,
  OFFLINE_SYNC_CHANNEL_NAME,
  offlinePreSaleSyncedEventSchema,
  readLatestOfflinePreSaleSync,
} from "@/modules/offline/sync/offline-sync-events";
import {
  preSalesQueryKey,
  salesQueryKey,
} from "@/modules/sales/queries/query-keys";

export function OfflineSalesRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const handledEventsRef = useRef(new Set<string>());
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    const handleSuccess = (value: unknown, allowBeforeMount = false) => {
      const parsed = offlinePreSaleSyncedEventSchema.safeParse(value);
      if (
        !parsed.success ||
        handledEventsRef.current.has(parsed.data.commandId)
      ) {
        return;
      }
      if (
        !allowBeforeMount &&
        Date.parse(parsed.data.syncedAt) < mountedAtRef.current
      ) {
        return;
      }

      handledEventsRef.current.add(parsed.data.commandId);
      queryClient.invalidateQueries({
        queryKey: salesQueryKey(parsed.data.orgSlug),
      });
      queryClient.invalidateQueries({
        queryKey: preSalesQueryKey(parsed.data.orgSlug),
      });

      if (getSalesListOrgSlug(pathname) === parsed.data.orgSlug) {
        router.refresh();
      }
    };

    const channel =
      "BroadcastChannel" in globalThis
        ? new BroadcastChannel(OFFLINE_SYNC_CHANNEL_NAME)
        : null;
    const handleMessage = (event: MessageEvent<unknown>) => {
      handleSuccess(event.data);
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      const orgSlug = getSalesListOrgSlug(pathname);
      if (event.persisted && orgSlug) {
        handleSuccess(readLatestOfflinePreSaleSync(orgSlug), true);
      }
    };

    channel?.addEventListener("message", handleMessage);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      channel?.removeEventListener("message", handleMessage);
      channel?.close();
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [pathname, queryClient, router]);

  return null;
}
