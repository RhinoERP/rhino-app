import { describe, expect, it } from "vitest";
import { sellerOfflineSnapshotV1Schema } from "./seller-offline-snapshot";

const organizationId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function createSnapshot() {
  return {
    schemaVersion: 1 as const,
    snapshotId: "00000000-0000-4000-8000-000000000003",
    generatedAt: "2026-09-14T12:00:00.000Z",
    expiresAt: "2026-09-15T00:00:00.000Z",
    ownerUserId: userId,
    organizationId,
    organization: {
      id: organizationId,
      slug: "acme",
      name: "Acme",
      cuit: null,
    },
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
      enabledPaymentMethods: ["efectivo" as const],
      defaultPaymentMethod: "efectivo" as const,
      defaultInvoiceType: "NOTA_DE_VENTA" as const,
    },
  };
}

describe("sellerOfflineSnapshotV1Schema", () => {
  it("acepta un snapshot V1 correctamente particionado", () => {
    expect(sellerOfflineSnapshotV1Schema.parse(createSnapshot())).toEqual(
      createSnapshot()
    );
  });

  it("rechaza una organizacion distinta a la particion", () => {
    const snapshot = createSnapshot();
    snapshot.organization.id = "00000000-0000-4000-8000-000000000004";

    expect(() => sellerOfflineSnapshotV1Schema.parse(snapshot)).toThrow(
      "La organizacion del snapshot no coincide con su particion"
    );
  });

  it("rechaza un vencimiento anterior a la generacion", () => {
    const snapshot = createSnapshot();
    snapshot.expiresAt = "2026-09-14T11:59:59.000Z";

    expect(() => sellerOfflineSnapshotV1Schema.parse(snapshot)).toThrow(
      "El vencimiento debe ser posterior a la generacion"
    );
  });
});
