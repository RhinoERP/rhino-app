"use client";

import { z } from "zod";

export const OFFLINE_SYNC_CHANNEL_NAME = "rhinos-offline-sync";
export const OFFLINE_SALES_SYNC_STORAGE_PREFIX =
  "rhinos-offline-sale-synced:v2:";
const SALES_LIST_PATH_PATTERN = /^\/org\/([^/]+)\/ventas\/?$/;
export const OFFLINE_SALES_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const offlinePreSaleSyncedEventSchema = z
  .object({
    type: z.literal("offline-pre-sale-synced"),
    commandId: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    orgSlug: z.string().min(1),
    resourceId: z.string().uuid(),
    syncedAt: z.string().datetime(),
  })
  .strict();

export type OfflinePreSaleSyncedEvent = z.infer<
  typeof offlinePreSaleSyncedEventSchema
>;

export const getSalesSyncStorageKey = (
  ownerUserId: string,
  organizationId: string
) => `${OFFLINE_SALES_SYNC_STORAGE_PREFIX}${ownerUserId}:${organizationId}`;

const broadcast = (value: unknown) => {
  if (typeof BroadcastChannel === "undefined") {
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
      getSalesSyncStorageKey(parsed.ownerUserId, parsed.organizationId),
      JSON.stringify(parsed)
    );
  } catch {
    // Active clients still receive BroadcastChannel when storage is unavailable.
  }
  broadcast(parsed);
}

export function readLatestOfflinePreSaleSync(
  ownerUserId: string,
  organizationId: string
): OfflinePreSaleSyncedEvent | null {
  const key = getSalesSyncStorageKey(ownerUserId, organizationId);
  try {
    const value = localStorage.getItem(key);
    if (!value) {
      return null;
    }
    const parsed = offlinePreSaleSyncedEventSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable entirely.
    }
    return null;
  }
}

export function getSalesListOrgSlug(pathname: string): string | null {
  const match = SALES_LIST_PATH_PATTERN.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
