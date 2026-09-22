"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  getSalesListOrgSlug,
  getSalesSyncStorageKey,
  OFFLINE_SALES_SYNC_MAX_AGE_MS,
  OFFLINE_SYNC_CHANNEL_NAME,
  offlinePreSaleSyncedEventSchema,
  readLatestOfflinePreSaleSync,
} from "@/modules/offline/sync/offline-sync-events";
import {
  preSalesQueryKey,
  salesQueryKey,
} from "@/modules/sales/queries/query-keys";

const MAX_HANDLED_EVENTS = 100;

type OfflineSalesRefreshProps = {
  organizationId: string;
  orgSlug: string;
  ownerUserId: string;
};

const getRelevantEvent = (
  value: unknown,
  { organizationId, orgSlug, ownerUserId }: OfflineSalesRefreshProps
) => {
  const parsed = offlinePreSaleSyncedEventSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const event = parsed.data;
  const age = Date.now() - Date.parse(event.syncedAt);
  if (
    event.ownerUserId !== ownerUserId ||
    event.organizationId !== organizationId ||
    event.orgSlug !== orgSlug ||
    age < 0 ||
    age > OFFLINE_SALES_SYNC_MAX_AGE_MS
  ) {
    return null;
  }
  return event;
};

export function OfflineSalesRefresh({
  organizationId,
  orgSlug,
  ownerUserId,
}: OfflineSalesRefreshProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const handledEventsRef = useRef(new Set<string>());
  const refreshedEventsRef = useRef(new Set<string>());

  useEffect(() => {
    const refreshSalesListOnce = (commandId: string, isSalesList: boolean) => {
      if (!isSalesList || refreshedEventsRef.current.has(commandId)) {
        return;
      }
      refreshedEventsRef.current.add(commandId);
      router.refresh();
    };
    const rememberHandled = (commandId: string) => {
      handledEventsRef.current.add(commandId);
      if (handledEventsRef.current.size <= MAX_HANDLED_EVENTS) {
        return;
      }
      const oldest = handledEventsRef.current.values().next().value;
      if (oldest) {
        handledEventsRef.current.delete(oldest);
        refreshedEventsRef.current.delete(oldest);
      }
    };
    const handleSuccess = (value: unknown) => {
      const event = getRelevantEvent(value, {
        organizationId,
        orgSlug,
        ownerUserId,
      });
      if (!event) {
        return;
      }
      const isSalesList = getSalesListOrgSlug(pathname) === orgSlug;
      if (handledEventsRef.current.has(event.commandId)) {
        refreshSalesListOnce(event.commandId, isSalesList);
        return;
      }

      rememberHandled(event.commandId);
      queryClient.invalidateQueries({
        queryKey: salesQueryKey(event.orgSlug),
      });
      queryClient.invalidateQueries({
        queryKey: preSalesQueryKey(event.orgSlug),
      });

      refreshSalesListOnce(event.commandId, isSalesList);
    };

    const readStored = () => {
      handleSuccess(readLatestOfflinePreSaleSync(ownerUserId, organizationId));
    };

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(OFFLINE_SYNC_CHANNEL_NAME)
        : null;
    const handleMessage = (event: MessageEvent<unknown>) => {
      handleSuccess(event.data);
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === getSalesSyncStorageKey(ownerUserId, organizationId) &&
        event.newValue
      ) {
        try {
          handleSuccess(JSON.parse(event.newValue));
        } catch {
          // Malformed storage notifications are ignored.
        }
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        readStored();
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        readStored();
      }
    };

    readStored();
    channel?.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      channel?.removeEventListener("message", handleMessage);
      channel?.close();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [organizationId, orgSlug, ownerUserId, pathname, queryClient, router]);

  return null;
}
