"use client";

import { sellerOfflineSnapshotV1Schema } from "../contracts/seller-offline-snapshot";
import {
  getSellerSnapshot,
  markSellerSnapshotChecked,
  type StoredSellerSnapshot,
  saveSellerSnapshot,
} from "../storage/offline-db";

export const OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const LOCK_NAME = "rhinos-offline-snapshot-refresh";
const inFlightByPartition = new Map<
  string,
  Promise<OfflineSnapshotRefreshResult>
>();

export type OfflineSnapshotRefreshResult = {
  status: "skipped" | "unchanged" | "updated";
  record: StoredSellerSnapshot | null;
};

type RefreshOptions = {
  orgSlug: string;
  organizationId: string;
  ownerUserId: string;
  force?: boolean;
  signal?: AbortSignal;
  now?: number;
};

function readRefreshMetadata(response: Response) {
  const generatedAt = response.headers.get("x-snapshot-generated-at");
  const expiresAt = response.headers.get("x-snapshot-expires-at");
  if (!(generatedAt && expiresAt)) {
    throw new Error("El servidor no devolvio una vigencia offline valida");
  }
  const generatedAtMs = Date.parse(generatedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(generatedAtMs)) {
    throw new Error("El servidor no devolvio una vigencia offline valida");
  }
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= generatedAtMs) {
    throw new Error("El servidor no devolvio una vigencia offline valida");
  }
  return { expiresAt, generatedAt };
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "No se pudieron actualizar los datos offline";
  } catch {
    return "No se pudieron actualizar los datos offline";
  }
}

async function refreshUnlocked(
  options: RefreshOptions
): Promise<OfflineSnapshotRefreshResult> {
  const now = options.now ?? Date.now();
  const current = await getSellerSnapshot(
    options.ownerUserId,
    options.organizationId
  );
  if (
    current &&
    !options.force &&
    Date.parse(current.snapshot.expiresAt) > now &&
    now - Date.parse(current.lastCheckedAt) <
      OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS
  ) {
    return { status: "skipped", record: current };
  }

  const headers = new Headers();
  if (current?.etag) {
    headers.set("If-None-Match", current.etag);
  }
  const response = await fetch(
    `/api/v1/org/${encodeURIComponent(options.orgSlug)}/seller-offline-snapshot`,
    { cache: "no-store", headers, signal: options.signal }
  );
  const etag = response.headers.get("etag");

  if (response.status === 304) {
    if (!current) {
      throw new Error("El servidor no devolvio los datos offline iniciales");
    }
    const validity = readRefreshMetadata(response);
    const record = await markSellerSnapshotChecked({
      ...validity,
      checkedAt: new Date(now).toISOString(),
      etag: etag ?? current.etag,
      organizationId: options.organizationId,
      ownerUserId: options.ownerUserId,
    });
    return { status: "unchanged", record };
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = await response.text();
  const snapshot = sellerOfflineSnapshotV1Schema.parse(
    JSON.parse(body) as unknown
  );
  if (
    snapshot.ownerUserId !== options.ownerUserId ||
    snapshot.organizationId !== options.organizationId
  ) {
    throw new Error("El snapshot no corresponde a la sesion actual");
  }

  const record = await saveSellerSnapshot(
    snapshot,
    new Blob([body]).size,
    etag,
    new Date(now).toISOString()
  );
  return { status: "updated", record };
}

export function refreshSellerOfflineSnapshot(
  options: RefreshOptions
): Promise<OfflineSnapshotRefreshResult> {
  const partition = `${options.ownerUserId}:${options.organizationId}`;
  const existing = inFlightByPartition.get(partition);
  if (existing) {
    return existing;
  }

  const refresh = navigator.locks
    ? navigator.locks
        .request(`${LOCK_NAME}:${partition}`, () => refreshUnlocked(options))
        .then((result) => result)
    : refreshUnlocked(options);
  inFlightByPartition.set(partition, refresh);
  const clear = () => {
    if (inFlightByPartition.get(partition) === refresh) {
      inFlightByPartition.delete(partition);
    }
  };
  refresh.then(clear, clear);
  return refresh;
}
