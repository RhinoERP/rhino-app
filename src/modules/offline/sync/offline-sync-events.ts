"use client";

import { z } from "zod";

export const OFFLINE_SYNC_CHANNEL_NAME = "rhinos-offline-sync";
const SALES_SYNC_STORAGE_PREFIX = "rhinos-offline-sale-synced:";
const SALES_LIST_PATH_PATTERN = /^\/org\/([^/]+)\/ventas\/?$/;

export const offlinePreSaleSyncedEventSchema = z
  .object({
    type: z.literal("offline-pre-sale-synced"),
    commandId: z.string().uuid(),
    orgSlug: z.string().min(1),
    resourceId: z.string().uuid(),
    syncedAt: z.string().datetime(),
  })
  .strict();

export type OfflinePreSaleSyncedEvent = z.infer<
  typeof offlinePreSaleSyncedEventSchema
>;

const getSalesSyncStorageKey = (orgSlug: string) =>
  `${SALES_SYNC_STORAGE_PREFIX}${orgSlug}`;

const broadcast = (value: unknown) => {
  if (!("BroadcastChannel" in globalThis)) {
    return;
  }
  const channel = new BroadcastChannel(OFFLINE_SYNC_CHANNEL_NAME);
  channel.postMessage(value);
  channel.close();
};

export function publishOfflineCommandStatus(commandId: string) {
  broadcast({ type: "offline-command-status", commandId });
}

export function publishOfflinePreSaleSynced(event: OfflinePreSaleSyncedEvent) {
  const parsed = offlinePreSaleSyncedEventSchema.parse(event);
  try {
    localStorage.setItem(
      getSalesSyncStorageKey(parsed.orgSlug),
      JSON.stringify(parsed)
    );
  } catch {
    // Active clients still receive BroadcastChannel when storage is unavailable.
  }
  broadcast(parsed);
}

export function readLatestOfflinePreSaleSync(
  orgSlug: string
): OfflinePreSaleSyncedEvent | null {
  try {
    const value = localStorage.getItem(getSalesSyncStorageKey(orgSlug));
    if (!value) {
      return null;
    }
    const parsed = offlinePreSaleSyncedEventSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function getSalesListOrgSlug(pathname: string): string | null {
  const match = SALES_LIST_PATH_PATTERN.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
