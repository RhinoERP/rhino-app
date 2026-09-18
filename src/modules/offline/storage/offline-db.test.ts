import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { OfflineCommandV1 } from "../contracts/offline-command";
import {
  enqueueOfflineCommand,
  getSellerSnapshotKey,
  isSellerSnapshotExpired,
  listOfflineCommands,
  purgeAllOfflineData,
  updateOfflineCommand,
} from "./offline-db";

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
});

describe("offline command storage", () => {
  const command = {
    commandId: "00000000-0000-4000-8000-000000000001",
    schemaVersion: 1,
    type: "preSale.create",
    ownerUserId: "00000000-0000-4000-8000-000000000002",
    organizationId: "00000000-0000-4000-8000-000000000003",
    orgSlugAtCreation: "luchobet",
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
  } satisfies OfflineCommandV1;

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
});
