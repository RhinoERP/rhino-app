import { z } from "zod";
import { OFFLINE_SYNC_CHANNEL_NAME } from "./offline-sync-events";

const PURGED_STORAGE_PREFIX = "rhinos-offline-data-purged:v1:";

export const offlineOrganizationPurgedEventSchema = z
  .object({
    type: z.literal("offline-organization-purged"),
    ownerUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    purgedAt: z.string().datetime(),
  })
  .strict();

export type OfflineOrganizationPurgedEvent = z.infer<
  typeof offlineOrganizationPurgedEventSchema
>;

function getStorageKey(ownerUserId: string, organizationId: string) {
  return `${PURGED_STORAGE_PREFIX}${ownerUserId}:${organizationId}`;
}

function parseEvent(value: unknown): OfflineOrganizationPurgedEvent | null {
  const parsed = offlineOrganizationPurgedEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function publishOfflineOrganizationPurged(params: {
  ownerUserId: string;
  organizationId: string;
  purgedAt?: string;
}): OfflineOrganizationPurgedEvent {
  const event = offlineOrganizationPurgedEventSchema.parse({
    type: "offline-organization-purged",
    ownerUserId: params.ownerUserId,
    organizationId: params.organizationId,
    purgedAt: params.purgedAt ?? new Date().toISOString(),
  });

  try {
    localStorage.setItem(
      getStorageKey(event.ownerUserId, event.organizationId),
      JSON.stringify(event)
    );
  } catch {
    // BroadcastChannel still informs open tabs if storage is unavailable.
  }

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(OFFLINE_SYNC_CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  }

  return event;
}

export function subscribeToOfflineOrganizationPurges(
  listener: (event: OfflineOrganizationPurgedEvent) => void
): () => void {
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(OFFLINE_SYNC_CHANNEL_NAME);
  const handleMessage = (event: MessageEvent<unknown>) => {
    const parsed = parseEvent(event.data);
    if (parsed) {
      listener(parsed);
    }
  };
  const handleStorage = (event: StorageEvent) => {
    if (!(event.key?.startsWith(PURGED_STORAGE_PREFIX) && event.newValue)) {
      return;
    }
    try {
      const parsed = parseEvent(JSON.parse(event.newValue));
      if (parsed) {
        listener(parsed);
      }
    } catch {
      // Ignore malformed storage events.
    }
  };

  channel?.addEventListener("message", handleMessage);
  window.addEventListener("storage", handleStorage);

  return () => {
    channel?.removeEventListener("message", handleMessage);
    channel?.close();
    window.removeEventListener("storage", handleStorage);
  };
}
