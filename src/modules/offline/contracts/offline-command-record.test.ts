import { describe, expect, it } from "vitest";
import { storedOfflineCommandSchema } from "./offline-command-record";

const command = {
  commandId: "00000000-0000-4000-8000-000000000001",
  schemaVersion: 1,
  type: "preSale.create",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  orgSlugAtCreation: "acme",
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
} as const;

const record = {
  commandId: command.commandId,
  draftId: "00000000-0000-4000-8000-000000000008",
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
} as const;

describe("storedOfflineCommandSchema", () => {
  it("rejects metadata that does not match the embedded command", () => {
    expect(
      storedOfflineCommandSchema.safeParse({
        ...record,
        ownerUserId: "00000000-0000-4000-8000-000000000009",
      }).success
    ).toBe(false);
  });
});
