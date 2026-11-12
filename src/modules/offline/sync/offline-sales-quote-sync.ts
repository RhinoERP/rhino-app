"use client";

import {
  listOfflineSalesQuoteCommands,
  updateOfflineSalesQuoteCommand,
} from "../storage/offline-db";

const SYNC_LOCK = "rhinos-offline-sales-quote-sync";
const inFlight = new Map<string, Promise<void>>();

function publishQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("rhinos-offline-sales-quote-queue-changed"));
  }
}

export function syncOfflineSalesQuotes(ownerUserId: string): Promise<void> {
  if (!navigator.onLine) {
    return Promise.resolve();
  }
  const existing = inFlight.get(ownerUserId);
  if (existing) {
    return existing;
  }
  const sync: Promise<void> = navigator.locks
    ? (async () => {
        await navigator.locks.request(
          `${SYNC_LOCK}:${ownerUserId}`,
          async () => {
            await syncUnlocked(ownerUserId);
          }
        );
      })()
    : syncUnlocked(ownerUserId);
  inFlight.set(ownerUserId, sync);
  const clear = () => {
    if (inFlight.get(ownerUserId) === sync) {
      inFlight.delete(ownerUserId);
    }
  };
  sync.then(clear, clear);
  return sync;
}

async function syncUnlocked(ownerUserId: string) {
  const records = await listOfflineSalesQuoteCommands(ownerUserId);
  const now = Date.now();
  for (const record of records) {
    if (
      record.status === "syncing" &&
      now - Date.parse(record.updatedAt) > 60_000
    ) {
      await updateOfflineSalesQuoteCommand(
        record.command.commandId,
        (current) => ({
          ...current,
          status: "queued",
          lastError: "Se reanudó un intento de sincronización interrumpido",
          updatedAt: new Date(now).toISOString(),
        })
      );
    }
  }
  const queued = (await listOfflineSalesQuoteCommands(ownerUserId)).filter(
    (record) => record.status === "queued"
  );
  for (const record of queued) {
    const commandId = record.command.commandId;
    await updateOfflineSalesQuoteCommand(commandId, (current) => ({
      ...current,
      status: "syncing",
      attempts: current.attempts + 1,
      updatedAt: new Date().toISOString(),
    }));
    publishQueueChanged();
    try {
      const response = await fetch("/api/v1/offline-sales-quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record.command),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      if (response.ok && result.requestId) {
        await updateOfflineSalesQuoteCommand(commandId, (current) => ({
          ...current,
          status: "synced",
          requestId: result.requestId,
          snapshotExpired: result.snapshotExpired === true,
          historicalCostMissing: result.historicalCostMissing === true,
          lastError: null,
          updatedAt: new Date().toISOString(),
        }));
      } else {
        await updateOfflineSalesQuoteCommand(commandId, (current) => ({
          ...current,
          status: response.status >= 500 ? "queued" : "requires-review",
          lastError: result.message ?? "No se pudo enviar la cotización",
          updatedAt: new Date().toISOString(),
        }));
      }
    } catch {
      await updateOfflineSalesQuoteCommand(commandId, (current) => ({
        ...current,
        status: "queued",
        lastError: "No se pudo conectar con el servidor",
        updatedAt: new Date().toISOString(),
      }));
    }
    publishQueueChanged();
  }
}

export async function retryOfflineSalesQuoteCommand(
  commandId: string,
  ownerUserId: string
) {
  const records = await listOfflineSalesQuoteCommands(ownerUserId);
  const record = records.find((entry) => entry.command.commandId === commandId);
  if (
    !record ||
    (record.status !== "requires-review" && record.status !== "failed")
  ) {
    return false;
  }
  await updateOfflineSalesQuoteCommand(commandId, (current) => ({
    ...current,
    status: "queued",
    lastError: null,
    updatedAt: new Date().toISOString(),
  }));
  publishQueueChanged();
  await syncOfflineSalesQuotes(ownerUserId);
  return true;
}
