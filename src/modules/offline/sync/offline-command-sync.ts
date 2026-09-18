"use client";

import { offlineCommandResultSchema } from "../contracts/offline-command";
import type { StoredOfflineCommand } from "../contracts/offline-command-record";
import {
  deleteOfflinePreSaleDraft,
  getActiveSellerSnapshot,
  listOfflineCommands,
  updateOfflineCommand,
} from "../storage/offline-db";
import {
  publishOfflineCommandStatus,
  publishOfflinePreSaleSynced,
} from "./offline-sync-events";

const LOCK_NAME = "rhinos-offline-command-replay";

const getNextAttemptAt = (attemptCount: number) => {
  const delayMs = Math.min(5000 * 2 ** Math.max(0, attemptCount - 1), 300_000);
  return new Date(Date.now() + delayMs).toISOString();
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

async function replayRecord(record: StoredOfflineCommand) {
  const attemptAt = new Date().toISOString();
  const syncing = await updateOfflineCommand(record.commandId, (current) => ({
    ...current,
    status: "syncing",
    attemptCount: current.attemptCount + 1,
    lastAttemptAt: attemptAt,
    updatedAt: attemptAt,
    lastError: null,
  }));
  if (!syncing) {
    return null;
  }
  publishOfflineCommandStatus(record.commandId);

  try {
    const response = await fetch("/api/v1/offline-commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncing.command),
      cache: "no-store",
    });
    const parsed = offlineCommandResultSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("Respuesta de sincronizacion invalida");
    }

    const now = new Date().toISOString();
    if (parsed.data.ok === true) {
      const resourceId = parsed.data.resourceId;
      const synced = await updateOfflineCommand(
        record.commandId,
        (current) => ({
          ...current,
          status: "synced",
          updatedAt: now,
          nextAttemptAt: null,
          resourceId,
          lastError: null,
        })
      );
      await deleteOfflinePreSaleDraft(record.draftId);
      publishOfflineCommandStatus(record.commandId);
      publishOfflinePreSaleSynced({
        type: "offline-pre-sale-synced",
        commandId: record.commandId,
        orgSlug: syncing.command.orgSlugAtCreation,
        resourceId,
        syncedAt: now,
      });
      return synced;
    }

    const failure = parsed.data;
    const retry = failure.retryable;
    const next = await updateOfflineCommand(record.commandId, (current) => ({
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
    }));
    publishOfflineCommandStatus(record.commandId);
    return next;
  } catch {
    const now = new Date().toISOString();
    const queued = await updateOfflineCommand(record.commandId, (current) => ({
      ...current,
      status: "queued",
      updatedAt: now,
      nextAttemptAt: getNextAttemptAt(current.attemptCount),
      lastError: {
        code: "RETRYABLE",
        message: "No se pudo conectar con el servidor",
        retryable: true,
      },
    }));
    publishOfflineCommandStatus(record.commandId);
    return queued;
  }
}

async function replayUnlocked(commandId?: string, force = false) {
  const active = await getActiveSellerSnapshot();
  if (!active) {
    return [];
  }
  const commands = await listOfflineCommands(
    active.ownerUserId,
    active.organizationId
  );
  const now = Date.now();
  const eligible = commands.filter(
    (command) =>
      (!commandId || command.commandId === commandId) &&
      (command.status === "queued" || command.status === "syncing") &&
      (force ||
        !command.nextAttemptAt ||
        Date.parse(command.nextAttemptAt) <= now)
  );
  const results: StoredOfflineCommand[] = [];
  for (const command of eligible) {
    const result = await replayRecord(command);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

export function replayOfflineCommands(commandId?: string, force = false) {
  if (navigator.locks) {
    return navigator.locks.request(LOCK_NAME, () =>
      replayUnlocked(commandId, force)
    );
  }
  return replayUnlocked(commandId, force);
}
