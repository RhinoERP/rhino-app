import { describe, expect, it } from "vitest";
import { offlinePreSaleDraftSchema } from "./offline-pre-sale-draft";

function createDraft() {
  return {
    draftId: "00000000-0000-4000-8000-000000000001",
    schemaVersion: 1 as const,
    ownerUserId: "00000000-0000-4000-8000-000000000002",
    organizationId: "00000000-0000-4000-8000-000000000003",
    orgSlug: "luchobet",
    snapshotId: "00000000-0000-4000-8000-000000000004",
    status: "draft" as const,
    createdAt: "2026-09-16T12:00:00.000Z",
    updatedAt: "2026-09-16T12:00:00.000Z",
    purgeAfterHours: 72,
    payload: {
      customerId: "00000000-0000-4000-8000-000000000005",
      sellerId: "00000000-0000-4000-8000-000000000002",
      paymentMethod: "efectivo" as const,
      invoiceType: "NOTA_DE_VENTA" as const,
      notes: "",
      items: [
        {
          lineId: "00000000-0000-4000-8000-000000000006",
          productId: "00000000-0000-4000-8000-000000000007",
          quantity: 2,
          unitPrice: 100,
          taxes: [],
        },
      ],
    },
  };
}

describe("offlinePreSaleDraftSchema", () => {
  it("valida un borrador serializable", () => {
    expect(offlinePreSaleDraftSchema.parse(createDraft())).toEqual(
      createDraft()
    );
  });

  it("rechaza cantidades no positivas", () => {
    const draft = createDraft();
    draft.payload.items[0].quantity = 0;
    expect(() => offlinePreSaleDraftSchema.parse(draft)).toThrow();
  });
});
