import { describe, expect, it } from "vitest";
import {
  createOfflinePreSaleCommand,
  offlineCommandResultSchema,
  offlineCommandV1Schema,
} from "./offline-command";
import type { OfflinePreSaleDraft } from "./offline-pre-sale-draft";
import type { SellerOfflineSnapshotV1 } from "./seller-offline-snapshot";

const ids = {
  command: "00000000-0000-4000-8000-000000000001",
  owner: "00000000-0000-4000-8000-000000000002",
  organization: "00000000-0000-4000-8000-000000000003",
  snapshot: "00000000-0000-4000-8000-000000000004",
  customer: "00000000-0000-4000-8000-000000000005",
  line: "00000000-0000-4000-8000-000000000006",
  product: "00000000-0000-4000-8000-000000000007",
  tax: "00000000-0000-4000-8000-000000000008",
  resource: "00000000-0000-4000-8000-000000000009",
};

function createDraft(): OfflinePreSaleDraft {
  return {
    draftId: ids.command,
    schemaVersion: 1,
    ownerUserId: ids.owner,
    organizationId: ids.organization,
    orgSlug: "luchobet",
    snapshotId: ids.snapshot,
    status: "draft",
    createdAt: "2026-09-17T12:00:00.000Z",
    updatedAt: "2026-09-17T12:00:00.000Z",
    purgeAfterHours: 72,
    payload: {
      customerId: ids.customer,
      sellerId: ids.owner,
      paymentMethod: "efectivo",
      invoiceType: "NOTA_DE_VENTA",
      notes: "Entregar por la tarde",
      items: [
        {
          lineId: ids.line,
          productId: ids.product,
          quantity: 2,
          unitPrice: 100,
          taxes: [
            {
              taxId: ids.tax,
              name: "IVA 21%",
              rate: 21,
              code: "IVA_21",
            },
          ],
        },
      ],
    },
  };
}

function createSnapshot(): SellerOfflineSnapshotV1 {
  return {
    schemaVersion: 1,
    snapshotId: ids.snapshot,
    generatedAt: "2026-09-17T12:00:00.000Z",
    expiresAt: "2026-09-18T00:00:00.000Z",
    ownerUserId: ids.owner,
    organizationId: ids.organization,
    organization: {
      id: ids.organization,
      slug: "luchobet",
      name: "LuchoBet",
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
      enabledPaymentMethods: ["efectivo"],
      defaultPaymentMethod: "efectivo",
      defaultInvoiceType: "NOTA_DE_VENTA",
    },
  };
}

describe("offlineCommandV1Schema", () => {
  it("convierte un borrador completo en un comando versionado", () => {
    const command = createOfflinePreSaleCommand({
      commandId: ids.command,
      createdAt: "2026-09-17T13:00:00.000Z",
      draft: createDraft(),
      saleDate: "2026-09-17",
      snapshot: createSnapshot(),
    });

    expect(offlineCommandV1Schema.parse(command)).toEqual(command);
    expect(command.payload.customerId).toBe(ids.customer);
    expect(command.payload.items[0].lineId).toBe(ids.line);
  });

  it("no permite encolar un borrador sin cliente", () => {
    const draft = createDraft();
    draft.payload.customerId = null;

    expect(() =>
      createOfflinePreSaleCommand({
        commandId: ids.command,
        createdAt: "2026-09-17T13:00:00.000Z",
        draft,
        saleDate: "2026-09-17",
        snapshot: createSnapshot(),
      })
    ).toThrow();
  });

  it("materializa impuestos por defecto cuando el producto no tiene propios", () => {
    const draft = createDraft();
    draft.payload.items[0].taxes = [];
    const snapshot = createSnapshot();
    snapshot.settings.defaultTaxIds = [ids.tax];
    snapshot.taxes = [
      {
        id: ids.tax,
        name: "IVA 21%",
        rate: 21,
        code: "IVA_21",
        isFavoriteSales: true,
      },
    ];

    const command = createOfflinePreSaleCommand({
      commandId: ids.command,
      createdAt: "2026-09-17T13:00:00.000Z",
      draft,
      saleDate: "2026-09-17",
      snapshot,
    });

    expect(command.payload.items[0].taxes).toEqual([
      {
        taxId: ids.tax,
        name: "IVA 21%",
        rate: 21,
        code: "IVA_21",
      },
    ]);
  });

  it("rechaza fechas invalidas e identificadores de linea duplicados", () => {
    const command = createOfflinePreSaleCommand({
      commandId: ids.command,
      createdAt: "2026-09-17T13:00:00.000Z",
      draft: createDraft(),
      saleDate: "2026-09-17",
      snapshot: createSnapshot(),
    });
    command.payload.saleDate = "17/09/2026";
    command.payload.items.push({ ...command.payload.items[0] });

    const result = offlineCommandV1Schema.safeParse(command);
    expect(result.success).toBe(false);
  });

  it("rechaza dias inexistentes aunque respeten el formato", () => {
    const command = createOfflinePreSaleCommand({
      commandId: ids.command,
      createdAt: "2026-09-17T13:00:00.000Z",
      draft: createDraft(),
      saleDate: "2026-09-17",
      snapshot: createSnapshot(),
    });
    command.payload.saleDate = "2026-02-31";

    expect(offlineCommandV1Schema.safeParse(command).success).toBe(false);
  });

  it("rechaza campos no declarados para mantener estable el protocolo", () => {
    const command = createOfflinePreSaleCommand({
      commandId: ids.command,
      createdAt: "2026-09-17T13:00:00.000Z",
      draft: createDraft(),
      saleDate: "2026-09-17",
      snapshot: createSnapshot(),
    });

    expect(
      offlineCommandV1Schema.safeParse({ ...command, unexpected: true }).success
    ).toBe(false);
  });
});

describe("offlineCommandResultSchema", () => {
  it("valida resultados exitosos idempotentes", () => {
    expect(
      offlineCommandResultSchema.parse({
        ok: true,
        commandId: ids.command,
        resourceId: ids.resource,
        duplicate: true,
      })
    ).toMatchObject({ ok: true, duplicate: true });
  });

  it("valida errores comerciales con diferencias", () => {
    expect(
      offlineCommandResultSchema.parse({
        ok: false,
        code: "REVIEW_REQUIRED",
        message: "El precio cambio",
        retryable: false,
        changes: [
          {
            path: "payload.items.0.unitPrice",
            message: "El precio actual es diferente",
            capturedValue: 100,
            currentValue: 120,
          },
        ],
      })
    ).toMatchObject({ ok: false, code: "REVIEW_REQUIRED" });
  });
});
