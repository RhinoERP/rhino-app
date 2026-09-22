"use client";

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import {
  type OfflineCommandV1,
  offlineCommandV1Schema,
} from "../contracts/offline-command";
import {
  type StoredOfflineCommand,
  storedOfflineCommandSchema,
} from "../contracts/offline-command-record";
import {
  type OfflinePreSaleDraft,
  offlinePreSaleDraftSchema,
} from "../contracts/offline-pre-sale-draft";
import {
  SELLER_OFFLINE_SNAPSHOT_SCHEMA_VERSION,
  type SellerOfflineSnapshotV1,
  sellerOfflineSnapshotV1Schema,
} from "../contracts/seller-offline-snapshot";

const DATABASE_NAME = "rhinos-offline";
const DATABASE_VERSION = 3;
const ACTIVE_SNAPSHOT_KEY = "active-seller-snapshot";
const ACTIVE_DRAFT_KEY = "active-pre-sale-draft";
const SYNCED_COMMAND_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredSellerSnapshot = {
  key: string;
  ownerUserId: string;
  organizationId: string;
  orgSlug: string;
  schemaVersion: number;
  downloadedAt: string;
  lastActiveAt: string;
  byteSize: number;
  snapshot: SellerOfflineSnapshotV1;
};

type ActiveSnapshotState = {
  key: string;
  snapshotKey: string;
  ownerUserId: string;
  organizationId: string;
  updatedAt: string;
};

type ActiveDraftState = {
  key: string;
  draftId: string;
  ownerUserId: string;
  organizationId: string;
  updatedAt: string;
};

type OfflineState = ActiveSnapshotState | ActiveDraftState;

interface RhinoOfflineDatabase extends DBSchema {
  snapshots: {
    key: string;
    value: StoredSellerSnapshot;
    indexes: {
      byOwner: string;
      byOrganization: string;
    };
  };
  state: {
    key: string;
    value: OfflineState;
  };
  drafts: {
    key: string;
    value: OfflinePreSaleDraft;
    indexes: {
      byOwner: string;
      byOrganization: string;
      byUpdatedAt: string;
    };
  };
  commands: {
    key: string;
    value: StoredOfflineCommand;
    indexes: {
      byOwner: string;
      byOrganization: string;
      byDraft: string;
      byStatus: string;
      byUpdatedAt: string;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<RhinoOfflineDatabase>> | null = null;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDB<RhinoOfflineDatabase>(
      DATABASE_NAME,
      DATABASE_VERSION,
      {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) {
            const snapshots = database.createObjectStore("snapshots", {
              keyPath: "key",
            });
            snapshots.createIndex("byOwner", "ownerUserId");
            snapshots.createIndex("byOrganization", "organizationId");
            database.createObjectStore("state", { keyPath: "key" });
          }
          if (oldVersion < 2) {
            const drafts = database.createObjectStore("drafts", {
              keyPath: "draftId",
            });
            drafts.createIndex("byOwner", "ownerUserId");
            drafts.createIndex("byOrganization", "organizationId");
            drafts.createIndex("byUpdatedAt", "updatedAt");
          }
          if (oldVersion < 3) {
            const commands = database.createObjectStore("commands", {
              keyPath: "commandId",
            });
            commands.createIndex("byOwner", "ownerUserId");
            commands.createIndex("byOrganization", "organizationId");
            commands.createIndex("byDraft", "draftId", { unique: true });
            commands.createIndex("byStatus", "status");
            commands.createIndex("byUpdatedAt", "updatedAt");
          }
        },
      }
    );
  }

  return databasePromise;
}

export function getSellerSnapshotKey(
  ownerUserId: string,
  organizationId: string
): string {
  return `${SELLER_OFFLINE_SNAPSHOT_SCHEMA_VERSION}:${ownerUserId}:${organizationId}`;
}

export function isSellerSnapshotExpired(
  snapshot: SellerOfflineSnapshotV1,
  now = Date.now()
): boolean {
  return Date.parse(snapshot.expiresAt) <= now;
}

export async function saveSellerSnapshot(
  value: unknown,
  byteSize: number
): Promise<StoredSellerSnapshot> {
  const snapshot = sellerOfflineSnapshotV1Schema.parse(value);
  const now = new Date().toISOString();
  const key = getSellerSnapshotKey(
    snapshot.ownerUserId,
    snapshot.organizationId
  );
  const record: StoredSellerSnapshot = {
    key,
    ownerUserId: snapshot.ownerUserId,
    organizationId: snapshot.organizationId,
    orgSlug: snapshot.organization.slug,
    schemaVersion: snapshot.schemaVersion,
    downloadedAt: now,
    lastActiveAt: now,
    byteSize,
    snapshot,
  };
  const database = await getDatabase();
  const transaction = database.transaction(["snapshots", "state"], "readwrite");
  await transaction.objectStore("snapshots").put(record);
  await transaction.objectStore("state").put({
    key: ACTIVE_SNAPSHOT_KEY,
    snapshotKey: key,
    ownerUserId: snapshot.ownerUserId,
    organizationId: snapshot.organizationId,
    updatedAt: now,
  });
  await transaction.done;

  return record;
}

async function readAndValidateSnapshot(
  record: StoredSellerSnapshot | undefined
): Promise<StoredSellerSnapshot | null> {
  if (!record) {
    return null;
  }

  const parsed = sellerOfflineSnapshotV1Schema.safeParse(record.snapshot);
  if (parsed.success) {
    return { ...record, snapshot: parsed.data };
  }

  const database = await getDatabase();
  await database.delete("snapshots", record.key);
  return null;
}

export async function getSellerSnapshot(
  ownerUserId: string,
  organizationId: string
): Promise<StoredSellerSnapshot | null> {
  const database = await getDatabase();
  const key = getSellerSnapshotKey(ownerUserId, organizationId);
  return readAndValidateSnapshot(await database.get("snapshots", key));
}

export async function getActiveSellerSnapshot(): Promise<StoredSellerSnapshot | null> {
  const database = await getDatabase();
  const active = await database.get("state", ACTIVE_SNAPSHOT_KEY);
  if (!(active && "snapshotKey" in active)) {
    return null;
  }

  const record = await readAndValidateSnapshot(
    await database.get("snapshots", active.snapshotKey)
  );
  if (!record) {
    await database.delete("state", ACTIVE_SNAPSHOT_KEY);
  }
  return record;
}

export async function purgeOfflineDataForOwner(ownerUserId: string) {
  const database = await getDatabase();
  const transaction = database.transaction(
    ["snapshots", "state", "drafts", "commands"],
    "readwrite"
  );
  const keys = await transaction
    .objectStore("snapshots")
    .index("byOwner")
    .getAllKeys(ownerUserId);
  for (const key of keys) {
    await transaction.objectStore("snapshots").delete(key);
  }
  const active = await transaction
    .objectStore("state")
    .get(ACTIVE_SNAPSHOT_KEY);
  if (active?.ownerUserId === ownerUserId) {
    await transaction.objectStore("state").delete(ACTIVE_SNAPSHOT_KEY);
  }
  const activeDraft = await transaction
    .objectStore("state")
    .get(ACTIVE_DRAFT_KEY);
  if (activeDraft?.ownerUserId === ownerUserId) {
    await transaction.objectStore("state").delete(ACTIVE_DRAFT_KEY);
  }
  const draftKeys = await transaction
    .objectStore("drafts")
    .index("byOwner")
    .getAllKeys(ownerUserId);
  for (const key of draftKeys) {
    await transaction.objectStore("drafts").delete(key);
  }
  const commandKeys = await transaction
    .objectStore("commands")
    .index("byOwner")
    .getAllKeys(ownerUserId);
  for (const key of commandKeys) {
    await transaction.objectStore("commands").delete(key);
  }
  await transaction.done;
}

export async function purgeAllOfflineData() {
  const database = await getDatabase();
  const transaction = database.transaction(
    ["snapshots", "state", "drafts", "commands"],
    "readwrite"
  );
  await transaction.objectStore("snapshots").clear();
  await transaction.objectStore("state").clear();
  await transaction.objectStore("drafts").clear();
  await transaction.objectStore("commands").clear();
  await transaction.done;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction keeps related purge rules atomic
export async function maintainOfflineDataForOwner(
  ownerUserId: string,
  now = Date.now()
) {
  const database = await getDatabase();
  const transaction = database.transaction(
    ["snapshots", "state", "drafts", "commands"],
    "readwrite"
  );
  const snapshots = await transaction.objectStore("snapshots").getAll();
  let active = await transaction.objectStore("state").get(ACTIVE_SNAPSHOT_KEY);

  for (const record of snapshots) {
    const belongsToCurrentOwner = record.ownerUserId === ownerUserId;
    const purgeAfterMs =
      record.snapshot.settings.purgeAfterHours * 60 * 60 * 1000;
    const inactiveTooLong =
      now - Date.parse(record.lastActiveAt) >= purgeAfterMs;

    if (!belongsToCurrentOwner || inactiveTooLong) {
      await transaction.objectStore("snapshots").delete(record.key);
      if (
        active &&
        "snapshotKey" in active &&
        active.snapshotKey === record.key
      ) {
        await transaction.objectStore("state").delete(ACTIVE_SNAPSHOT_KEY);
        active = undefined;
      }
    }
  }

  const commands = await transaction.objectStore("commands").getAll();
  const retainedDraftIds = new Set<string>();
  for (const command of commands) {
    if (command.ownerUserId !== ownerUserId) {
      await transaction.objectStore("commands").delete(command.commandId);
    } else if (
      command.status === "synced" &&
      now - Date.parse(command.updatedAt) >= SYNCED_COMMAND_RETENTION_MS
    ) {
      await transaction.objectStore("commands").delete(command.commandId);
    } else if (command.status !== "synced") {
      retainedDraftIds.add(command.draftId);
    }
  }

  const drafts = await transaction.objectStore("drafts").getAll();
  for (const draft of drafts) {
    const belongsToCurrentOwner = draft.ownerUserId === ownerUserId;
    const inactiveTooLong =
      now - Date.parse(draft.updatedAt) >=
      draft.purgeAfterHours * 60 * 60 * 1000;
    if (
      !belongsToCurrentOwner ||
      (inactiveTooLong && !retainedDraftIds.has(draft.draftId))
    ) {
      await transaction.objectStore("drafts").delete(draft.draftId);
    }
  }

  const activeDraft = await transaction
    .objectStore("state")
    .get(ACTIVE_DRAFT_KEY);
  if (activeDraft && "draftId" in activeDraft) {
    const selectedDraft = await transaction
      .objectStore("drafts")
      .get(activeDraft.draftId);
    if (
      activeDraft.ownerUserId !== ownerUserId ||
      !selectedDraft ||
      selectedDraft.ownerUserId !== activeDraft.ownerUserId ||
      selectedDraft.organizationId !== activeDraft.organizationId
    ) {
      await transaction.objectStore("state").delete(ACTIVE_DRAFT_KEY);
    }
  }

  await transaction.done;
}

export async function touchOfflineDataForOwner(ownerUserId: string) {
  const database = await getDatabase();
  const transaction = database.transaction(["snapshots", "state"], "readwrite");
  const index = transaction.objectStore("snapshots").index("byOwner");
  const records = await index.getAll(ownerUserId);
  const now = new Date().toISOString();
  for (const record of records) {
    await transaction.objectStore("snapshots").put({
      ...record,
      lastActiveAt: now,
    });
  }
  await transaction.done;
}

export async function saveOfflinePreSaleDraft(value: unknown) {
  const draft = offlinePreSaleDraftSchema.parse(value);
  const database = await getDatabase();
  const transaction = database.transaction(["drafts", "state"], "readwrite");
  await transaction.objectStore("drafts").put(draft);
  await transaction.objectStore("state").put({
    key: ACTIVE_DRAFT_KEY,
    draftId: draft.draftId,
    ownerUserId: draft.ownerUserId,
    organizationId: draft.organizationId,
    updatedAt: draft.updatedAt,
  });
  await transaction.done;
  return draft;
}

export async function listOfflinePreSaleDrafts(
  ownerUserId: string,
  organizationId: string
): Promise<OfflinePreSaleDraft[]> {
  const database = await getDatabase();
  const records = await database.getAllFromIndex(
    "drafts",
    "byOrganization",
    organizationId
  );
  const valid: OfflinePreSaleDraft[] = [];
  for (const record of records) {
    if (record.ownerUserId !== ownerUserId) {
      continue;
    }
    const parsed = offlinePreSaleDraftSchema.safeParse(record);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      await database.delete("drafts", record.draftId);
    }
  }
  return valid.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export async function getActiveOfflinePreSaleDraft(
  ownerUserId: string,
  organizationId: string
): Promise<OfflinePreSaleDraft | null> {
  const database = await getDatabase();
  const state = await database.get("state", ACTIVE_DRAFT_KEY);
  if (
    state &&
    "draftId" in state &&
    state.ownerUserId === ownerUserId &&
    state.organizationId === organizationId
  ) {
    const draft = await database.get("drafts", state.draftId);
    const parsed = offlinePreSaleDraftSchema.safeParse(draft);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return null;
}

export async function selectOfflinePreSaleDraft(
  draftId: string,
  ownerUserId: string,
  organizationId: string
) {
  const database = await getDatabase();
  const draft = await database.get("drafts", draftId);
  const parsed = offlinePreSaleDraftSchema.parse(draft);
  if (
    parsed.ownerUserId !== ownerUserId ||
    parsed.organizationId !== organizationId
  ) {
    throw new Error("El borrador no pertenece a la particion activa");
  }
  await database.put("state", {
    key: ACTIVE_DRAFT_KEY,
    draftId: parsed.draftId,
    ownerUserId: parsed.ownerUserId,
    organizationId: parsed.organizationId,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearActiveOfflinePreSaleDraft(
  ownerUserId: string,
  organizationId: string
) {
  const database = await getDatabase();
  const active = await database.get("state", ACTIVE_DRAFT_KEY);
  if (
    active &&
    "draftId" in active &&
    active.ownerUserId === ownerUserId &&
    active.organizationId === organizationId
  ) {
    await database.delete("state", ACTIVE_DRAFT_KEY);
  }
}

export async function deleteOfflinePreSaleDraft(
  draftId: string,
  ownerUserId?: string,
  organizationId?: string
) {
  const database = await getDatabase();
  const transaction = database.transaction(["drafts", "state"], "readwrite");
  const draft = await transaction.objectStore("drafts").get(draftId);
  if (
    (ownerUserId && draft?.ownerUserId !== ownerUserId) ||
    (organizationId && draft?.organizationId !== organizationId)
  ) {
    await transaction.done;
    return;
  }
  await transaction.objectStore("drafts").delete(draftId);
  const active = await transaction.objectStore("state").get(ACTIVE_DRAFT_KEY);
  if (active && "draftId" in active && active.draftId === draftId) {
    await transaction.objectStore("state").delete(ACTIVE_DRAFT_KEY);
  }
  await transaction.done;
}

export async function enqueueOfflineCommand(
  draftId: string,
  value: OfflineCommandV1
): Promise<StoredOfflineCommand> {
  const command = offlineCommandV1Schema.parse(value);
  const database = await getDatabase();
  const transaction = database.transaction("commands", "readwrite");
  const store = transaction.objectStore("commands");
  const existing = await store.index("byDraft").get(draftId);
  if (existing) {
    await transaction.done;
    return storedOfflineCommandSchema.parse(existing);
  }

  const record = storedOfflineCommandSchema.parse({
    commandId: command.commandId,
    draftId,
    ownerUserId: command.ownerUserId,
    organizationId: command.organizationId,
    status: "queued",
    attemptCount: 0,
    createdAt: command.createdAt,
    updatedAt: command.createdAt,
    lastAttemptAt: null,
    nextAttemptAt: null,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    resourceId: null,
    lastError: null,
    command,
  });
  await store.add(record);
  await transaction.done;
  return record;
}

export async function listOfflineCommands(
  ownerUserId: string,
  organizationId?: string
): Promise<StoredOfflineCommand[]> {
  const database = await getDatabase();
  const records = await database.getAllFromIndex(
    "commands",
    organizationId ? "byOrganization" : "byOwner",
    organizationId ?? ownerUserId
  );
  const valid: StoredOfflineCommand[] = [];
  for (const record of records) {
    if (record.ownerUserId !== ownerUserId) {
      continue;
    }
    const parsed = storedOfflineCommandSchema.safeParse(record);
    if (parsed.success) {
      valid.push(parsed.data);
    }
  }
  return valid.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

export async function claimOfflineCommand(options: {
  commandId: string;
  ownerUserId: string;
  leaseOwnerId: string;
  now: number;
  leaseDurationMs: number;
  force?: boolean;
}): Promise<StoredOfflineCommand | null> {
  const {
    commandId,
    ownerUserId,
    leaseOwnerId,
    now,
    leaseDurationMs,
    force = false,
  } = options;
  const nowIso = new Date(now).toISOString();
  const database = await getDatabase();
  const transaction = database.transaction("commands", "readwrite");
  const store = transaction.objectStore("commands");
  const parsed = storedOfflineCommandSchema.safeParse(
    await store.get(commandId)
  );
  if (!parsed.success) {
    await transaction.done;
    return null;
  }

  const current = parsed.data;
  const leaseActive =
    current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) > now;
  const retryDue =
    force || !current.nextAttemptAt || Date.parse(current.nextAttemptAt) <= now;
  if (
    current.ownerUserId !== ownerUserId ||
    (current.status !== "queued" && current.status !== "syncing") ||
    leaseActive ||
    !retryDue
  ) {
    await transaction.done;
    return null;
  }

  const claimed = storedOfflineCommandSchema.parse({
    ...current,
    status: "syncing",
    attemptCount: current.attemptCount + 1,
    lastAttemptAt: nowIso,
    updatedAt: nowIso,
    leaseOwnerId,
    leaseExpiresAt: new Date(now + leaseDurationMs).toISOString(),
    lastError: null,
  });
  await store.put(claimed);
  await transaction.done;
  return claimed;
}

export async function finalizeOfflineCommandClaim(
  commandId: string,
  leaseOwnerId: string,
  update: (current: StoredOfflineCommand) => StoredOfflineCommand
): Promise<StoredOfflineCommand | null> {
  const database = await getDatabase();
  const transaction = database.transaction("commands", "readwrite");
  const store = transaction.objectStore("commands");
  const parsed = storedOfflineCommandSchema.safeParse(
    await store.get(commandId)
  );
  if (
    !parsed.success ||
    parsed.data.status === "synced" ||
    parsed.data.leaseOwnerId !== leaseOwnerId
  ) {
    await transaction.done;
    return null;
  }
  const next = storedOfflineCommandSchema.parse({
    ...update(parsed.data),
    leaseOwnerId: null,
    leaseExpiresAt: null,
  });
  await store.put(next);
  await transaction.done;
  return next;
}

export async function updateOfflineCommand(
  commandId: string,
  update: (current: StoredOfflineCommand) => StoredOfflineCommand
): Promise<StoredOfflineCommand | null> {
  const database = await getDatabase();
  const transaction = database.transaction("commands", "readwrite");
  const store = transaction.objectStore("commands");
  const current = await store.get(commandId);
  const parsed = storedOfflineCommandSchema.safeParse(current);
  if (!parsed.success) {
    await transaction.done;
    return null;
  }
  const next = storedOfflineCommandSchema.parse(update(parsed.data));
  await store.put(next);
  await transaction.done;
  return next;
}

export async function deleteOfflineCommand(
  commandId: string,
  ownerUserId: string,
  organizationId: string
) {
  const database = await getDatabase();
  const transaction = database.transaction("commands", "readwrite");
  const store = transaction.objectStore("commands");
  const command = await store.get(commandId);
  if (!command) {
    await transaction.done;
    return true;
  }
  if (
    command.ownerUserId !== ownerUserId ||
    command.organizationId !== organizationId ||
    command.status === "syncing" ||
    (command.leaseExpiresAt && Date.parse(command.leaseExpiresAt) > Date.now())
  ) {
    await transaction.done;
    return false;
  }
  await store.delete(commandId);
  await transaction.done;
  return true;
}

export async function deleteOfflineCommandForDraft(
  draftId: string,
  ownerUserId: string,
  organizationId: string
) {
  const database = await getDatabase();
  const transaction = database.transaction("commands", "readwrite");
  const store = transaction.objectStore("commands");
  const command = await store.index("byDraft").get(draftId);
  if (!command) {
    await transaction.done;
    return true;
  }
  if (
    command.ownerUserId !== ownerUserId ||
    command.organizationId !== organizationId ||
    command.status === "syncing" ||
    (command.leaseExpiresAt && Date.parse(command.leaseExpiresAt) > Date.now())
  ) {
    await transaction.done;
    return false;
  }
  await store.delete(command.commandId);
  await transaction.done;
  return true;
}
