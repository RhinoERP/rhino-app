import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { OfflineCommandV1 } from "../contracts/offline-command";
import type { OfflinePreSaleDraft } from "../contracts/offline-pre-sale-draft";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";
import {
  claimOfflineCommand,
  deleteOfflineCommand,
  enqueueOfflineCommand,
  getActiveOfflinePreSaleDraft,
  getActiveSellerSnapshot,
  getSellerSnapshot,
  getSellerSnapshotKey,
  isSellerSnapshotExpired,
  listOfflineCommands,
  listOfflinePreSaleDrafts,
  maintainOfflineDataForOwner,
  purgeAllOfflineData,
  purgeOfflineDataForOrganization,
  saveOfflinePreSaleDraft,
  saveSellerSnapshot,
  updateOfflineCommand,
} from "./offline-db";

const ownerUserId = "00000000-0000-4000-8000-000000000002";
const organizationAId = "00000000-0000-4000-8000-000000000003";
const organizationBId = "00000000-0000-4000-8000-000000000012";
const generatedAt = "2026-09-30T12:00:00.000Z";

function makeSnapshot(
  organizationId: string,
  slug: string
): SellerOfflineSnapshotV1 {
  return {
    schemaVersion: 1,
    snapshotId: crypto.randomUUID(),
    generatedAt,
    expiresAt: "2026-10-01T00:00:00.000Z",
    ownerUserId,
    organizationId,
    organization: { id: organizationId, slug, name: slug, cuit: null },
    customers: [],
    products: [],
    taxes: [],
    sellers: [],
    salesPriceLists: [],
    customerPriceAssignments: [],
    purchasePriceListItems: [],
    settings: {
      purgeAfterHours: 72,
      configurablePriceListsEnabled: false,
      dueDaysEnabled: false,
      dueDaysDefault: 30,
      defaultTaxIds: [],
      enabledPaymentMethods: ["efectivo"],
      defaultPaymentMethod: "efectivo",
      defaultInvoiceType: "NOTA_DE_VENTA",
    },
  };
}

function makeDraft(
  draftId: string,
  organizationId: string,
  orgSlug: string
): OfflinePreSaleDraft {
  return {
    draftId,
    schemaVersion: 1,
    ownerUserId,
    organizationId,
    orgSlug,
    snapshotId: "00000000-0000-4000-8000-000000000004",
    status: "draft",
    createdAt: generatedAt,
    updatedAt: generatedAt,
    purgeAfterHours: 72,
    payload: {
      customerId: null,
      sellerId: ownerUserId,
      paymentMethod: "efectivo",
      invoiceType: "NOTA_DE_VENTA",
      notes: "",
      items: [],
    },
  };
}

describe("offline snapshot storage rules", () => {
  it("particiona por version, usuario y organizacion", () => {
    expect(
      getSellerSnapshotKey(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002"
      )
    ).toBe(
      "1:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002"
    );
  });

  it("identifica un snapshot vencido", () => {
    const snapshot = {
      expiresAt: "2026-09-16T12:00:00.000Z",
    };

    expect(
      isSellerSnapshotExpired(
        snapshot as never,
        Date.parse("2026-09-16T12:00:00.000Z")
      )
    ).toBe(true);
  });

  it("purges the revoked organization without touching another organization", async () => {
    await purgeAllOfflineData();
    const snapshotA = makeSnapshot(organizationAId, "org-a");
    const snapshotB = makeSnapshot(organizationBId, "org-b");
    await saveSellerSnapshot(snapshotA, 10);
    await saveSellerSnapshot(snapshotB, 20);

    const draftA = makeDraft(
      "00000000-0000-4000-8000-000000000013",
      organizationAId,
      "org-a"
    );
    const draftB = makeDraft(
      "00000000-0000-4000-8000-000000000014",
      organizationBId,
      "org-b"
    );
    await saveOfflinePreSaleDraft(draftA);
    await saveOfflinePreSaleDraft(draftB);

    const commandA = makeCommand(organizationAId, "org-a");
    const commandB = makeCommand(organizationBId, "org-b", 15);
    await enqueueOfflineCommand(draftA.draftId, commandA);
    await enqueueOfflineCommand(draftB.draftId, commandB);

    await purgeOfflineDataForOrganization(ownerUserId, organizationAId);

    await expect(getSellerSnapshot(ownerUserId, organizationAId)).resolves.toBe(
      null
    );
    await expect(
      getSellerSnapshot(ownerUserId, organizationBId)
    ).resolves.toMatchObject({ snapshot: { organizationId: organizationBId } });
    await expect(
      listOfflinePreSaleDrafts(ownerUserId, organizationAId)
    ).resolves.toEqual([]);
    await expect(
      listOfflinePreSaleDrafts(ownerUserId, organizationBId)
    ).resolves.toHaveLength(1);
    await expect(
      listOfflineCommands(ownerUserId, organizationAId)
    ).resolves.toEqual([]);
    await expect(
      listOfflineCommands(ownerUserId, organizationBId)
    ).resolves.toHaveLength(1);
    await expect(getActiveSellerSnapshot()).resolves.toMatchObject({
      organizationId: organizationBId,
    });
    await expect(
      getActiveOfflinePreSaleDraft(ownerUserId, organizationBId)
    ).resolves.toMatchObject({ draftId: draftB.draftId });
  });
});

describe("offline command storage", () => {
  const command = makeCommand(organizationAId, "luchobet");

  it("encola una sola operacion por borrador y persiste cambios de estado", async () => {
    await purgeAllOfflineData();
    const draftId = "00000000-0000-4000-8000-000000000008";
    const first = await enqueueOfflineCommand(draftId, command);
    const duplicate = await enqueueOfflineCommand(draftId, {
      ...command,
      commandId: "00000000-0000-4000-8000-000000000009",
    });

    expect(duplicate.commandId).toBe(first.commandId);
    await updateOfflineCommand(first.commandId, (current) => ({
      ...current,
      status: "syncing",
      attemptCount: 1,
      lastAttemptAt: "2026-09-17T13:01:00.000Z",
      updatedAt: "2026-09-17T13:01:00.000Z",
    }));

    const records = await listOfflineCommands(
      command.ownerUserId,
      command.organizationId
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: "syncing", attemptCount: 1 });
  });

  it("claims atomically and only permits syncing again after lease expiry", async () => {
    await purgeAllOfflineData();
    const draftId = "00000000-0000-4000-8000-000000000008";
    await enqueueOfflineCommand(draftId, command);
    const now = Date.parse("2026-09-17T13:00:00.000Z");
    const firstLease = "00000000-0000-4000-8000-000000000010";

    const first = await claimOfflineCommand({
      commandId: command.commandId,
      ownerUserId: command.ownerUserId,
      leaseOwnerId: firstLease,
      now,
      leaseDurationMs: 60_000,
    });
    const concurrent = await claimOfflineCommand({
      commandId: command.commandId,
      ownerUserId: command.ownerUserId,
      leaseOwnerId: "00000000-0000-4000-8000-000000000011",
      now,
      leaseDurationMs: 60_000,
    });
    const stale = await claimOfflineCommand({
      commandId: command.commandId,
      ownerUserId: command.ownerUserId,
      leaseOwnerId: "00000000-0000-4000-8000-000000000012",
      now: now + 60_000,
      leaseDurationMs: 60_000,
    });

    expect(first).toMatchObject({
      status: "syncing",
      leaseOwnerId: firstLease,
    });
    expect(concurrent).toBeNull();
    expect(stale).toMatchObject({ status: "syncing", attemptCount: 2 });
  });

  it("does not delete a command after replay claimed it", async () => {
    await purgeAllOfflineData();
    await enqueueOfflineCommand(
      "00000000-0000-4000-8000-000000000008",
      command
    );
    await claimOfflineCommand({
      commandId: command.commandId,
      ownerUserId: command.ownerUserId,
      leaseOwnerId: "00000000-0000-4000-8000-000000000010",
      now: Date.parse("2026-09-17T13:00:00.000Z"),
      leaseDurationMs: 60_000,
    });

    await expect(
      deleteOfflineCommand(
        command.commandId,
        command.ownerUserId,
        command.organizationId
      )
    ).resolves.toBe(false);
    await expect(
      listOfflineCommands(command.ownerUserId, command.organizationId)
    ).resolves.toHaveLength(1);
  });

  it("purges synced commands after seven days but retains unresolved work", async () => {
    await purgeAllOfflineData();
    const now = Date.parse("2026-09-24T13:00:00.000Z");
    const synced = await enqueueOfflineCommand(
      "00000000-0000-4000-8000-000000000008",
      command
    );
    await updateOfflineCommand(synced.commandId, (current) => ({
      ...current,
      status: "synced",
      updatedAt: "2026-09-17T13:00:00.000Z",
      resourceId: "00000000-0000-4000-8000-000000000010",
    }));
    await enqueueOfflineCommand("00000000-0000-4000-8000-000000000009", {
      ...command,
      commandId: "00000000-0000-4000-8000-000000000011",
    });

    await maintainOfflineDataForOwner(command.ownerUserId, now);

    const records = await listOfflineCommands(
      command.ownerUserId,
      command.organizationId
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: "queued" });
  });
});

function makeCommand(
  organizationId: string,
  orgSlugAtCreation: string,
  commandIdSuffix = 1
): OfflineCommandV1 {
  return {
    commandId: `00000000-0000-4000-8000-${String(commandIdSuffix).padStart(12, "0")}`,
    schemaVersion: 1,
    type: "preSale.create",
    ownerUserId,
    organizationId,
    orgSlugAtCreation,
    snapshotId: "00000000-0000-4000-8000-000000000004",
    createdAt: "2026-09-17T13:00:00.000Z",
    payload: {
      customerId: "00000000-0000-4000-8000-000000000005",
      sellerId: "00000000-0000-4000-8000-000000000002",
      saleDate: "2026-09-17",
      paymentMethod: "efectivo",
      invoiceType: "NOTA_DE_VENTA",
      observations: "",
      items: [
        {
          lineId: "00000000-0000-4000-8000-000000000006",
          productId: "00000000-0000-4000-8000-000000000007",
          quantity: 1,
          unitPrice: 100,
          taxes: [],
        },
      ],
    },
  };
}
