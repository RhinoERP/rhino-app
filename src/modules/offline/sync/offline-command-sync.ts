"use client";

import { offlineCommandResultSchema } from "../contracts/offline-command";
import type { StoredOfflineCommand } from "../contracts/offline-command-record";
import {
  claimOfflineCommand,
  deleteOfflinePreSaleDraft,
  finalizeOfflineCommandClaim,
  listOfflineCommands,
} from "../storage/offline-db";
import {
  publishOfflineCommandStatus,
  publishOfflinePreSaleSynced,
} from "./offline-sync-events";

const LOCK_NAME = "rhinos-offline-command-replay";
const FETCH_TIMEOUT_MS = 15_000;
const LEASE_DURATION_MS = 60_000;
const MAX_BACKOFF_MS = 300_000;
const inFlightByOwner = new Map<string, Promise<StoredOfflineCommand[]>>();

export const getNextAttemptAt = (
  attemptCount: number,
  now = Date.now(),
  random = Math.random
) => {
  const ceiling = Math.min(
    5000 * 2 ** Math.max(0, attemptCount - 1),
    MAX_BACKOFF_MS
  );
  const delayMs = Math.round(ceiling * (0.5 + random() * 0.5));
  return new Date(now + delayMs).toISOString();
};

const getFailureStatus = (
  retryable: boolean,
  code:
    | "AUTH_REQUIRED"
    | "FORBIDDEN"
    | "VALIDATION_ERROR"
    | "STALE_REFERENCE"
    | "REVIEW_REQUIRED"
    | "RETRYABLE"
): StoredOfflineCommand["status"] => {
  if (retryable) {
    return "queued";
  }
  if (code === "FORBIDDEN" || code === "VALIDATION_ERROR") {
    return "failed";
  }
  return "requires-review";
};

async function replayRecord(
  record: StoredOfflineCommand,
  ownerUserId: string,
  force: boolean
) {
  const leaseOwnerId = crypto.randomUUID();
  const syncing = await claimOfflineCommand({
    commandId: record.commandId,
    ownerUserId,
    leaseOwnerId,
    now: Date.now(),
    leaseDurationMs: LEASE_DURATION_MS,
    force,
  });
  if (!syncing) {
    return null;
  }
  publishOfflineCommandStatus(record.commandId);

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS
  );
  try {
    const response = await fetch("/api/v1/offline-commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncing.command),
      cache: "no-store",
      signal: controller.signal,
    });
    const parsed = offlineCommandResultSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("Respuesta de sincronizacion invalida");
    }

    const now = new Date().toISOString();
    if (parsed.data.ok === true) {
      const resourceId = parsed.data.resourceId;
      const synced = await finalizeOfflineCommandClaim(
        record.commandId,
        leaseOwnerId,
        (current) => ({
          ...current,
          status: "synced",
          updatedAt: now,
          nextAttemptAt: null,
          resourceId,
          lastError: null,
        })
      );
      if (!synced) {
        return null;
      }
      await deleteOfflinePreSaleDraft(
        record.draftId,
        syncing.ownerUserId,
        syncing.organizationId
      ).catch(() => null);
      publishOfflineCommandStatus(record.commandId);
      publishOfflinePreSaleSynced({
        type: "offline-pre-sale-synced",
        commandId: record.commandId,
        ownerUserId: syncing.ownerUserId,
        organizationId: syncing.organizationId,
        orgSlug: syncing.command.orgSlugAtCreation,
        resourceId,
        syncedAt: now,
      });
      return synced;
    }

    const failure = parsed.data;
    const retry = failure.retryable;
    const next = await finalizeOfflineCommandClaim(
      record.commandId,
      leaseOwnerId,
      (current) => ({
        ...current,
        status: getFailureStatus(failure.retryable, failure.code),
        updatedAt: now,
        nextAttemptAt: retry ? getNextAttemptAt(current.attemptCount) : null,
        lastError: {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
          ...(failure.changes ? { changes: failure.changes } : {}),
        },
      })
    );
    if (next) {
      publishOfflineCommandStatus(record.commandId);
    }
    return next;
  } catch {
    const now = new Date().toISOString();
    const queued = await finalizeOfflineCommandClaim(
      record.commandId,
      leaseOwnerId,
      (current) => ({
        ...current,
        status: "queued",
        updatedAt: now,
        nextAttemptAt: getNextAttemptAt(current.attemptCount),
        lastError: {
          code: "RETRYABLE",
          message: "No se pudo conectar con el servidor",
          retryable: true,
        },
      })
    );
    if (queued) {
      publishOfflineCommandStatus(record.commandId);
    }
    return queued;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function replayUnlocked(
  ownerUserId: string,
  commandId?: string,
  force = false
) {
  const commands = await listOfflineCommands(ownerUserId);
  const now = Date.now();
  const eligible = commands.filter(
    (command) =>
      (!commandId || command.commandId === commandId) &&
      (command.status === "queued" ||
        (command.status === "syncing" &&
          (!command.leaseExpiresAt ||
            Date.parse(command.leaseExpiresAt) <= now))) &&
      (force ||
        !command.nextAttemptAt ||
        Date.parse(command.nextAttemptAt) <= now)
  );
  const results: StoredOfflineCommand[] = [];
  for (const command of eligible) {
    const result = await replayRecord(command, ownerUserId, force);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

export function replayOfflineCommands(
  ownerUserId: string,
  commandId?: string,
  force = false
): Promise<StoredOfflineCommand[]> {
  const existing = inFlightByOwner.get(ownerUserId);
  if (existing) {
    if (commandId) {
      return existing.then((results) => {
        const requested = results.find(
          (result) => result.commandId === commandId
        );
        if (requested) {
          return [requested];
        }
        if (inFlightByOwner.get(ownerUserId) === existing) {
          inFlightByOwner.delete(ownerUserId);
        }
        return replayOfflineCommands(ownerUserId, commandId, force);
      });
    }
    return existing;
  }

  const replay: Promise<StoredOfflineCommand[]> = navigator.locks
    ? navigator.locks
        .request(`${LOCK_NAME}:${ownerUserId}`, () =>
          replayUnlocked(ownerUserId, commandId, force)
        )
        .then((result) => result)
    : replayUnlocked(ownerUserId, commandId, force);
  inFlightByOwner.set(ownerUserId, replay);
  const clearSingleFlight = () => {
    if (inFlightByOwner.get(ownerUserId) === replay) {
      inFlightByOwner.delete(ownerUserId);
    }
  };
  replay.then(clearSingleFlight, clearSingleFlight);
  return replay;
}
