// Synthetic browser-test data. This signature is deliberately invalid and must
// only be sent to the test relay's mocked API, never to a real backend.
export const testSignature = "browser-test-signature";

export function makePwaTestSnapshot() {
  const ownerUserId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";
  const priceLevelId = "00000000-0000-4000-8000-000000000005";
  return {
    schemaVersion: 1,
    snapshotId: crypto.randomUUID(),
    ownerUserId,
    organizationId,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 43_200_000).toISOString(),
    organization: {
      id: organizationId,
      slug: "pwa-test",
      name: "PWA Test",
      cuit: null,
    },
    customers: [
      {
        id: "00000000-0000-4000-8000-000000000003",
        businessName: "Cliente de prueba offline",
        fantasyName: null,
        clientNumber: null,
        cuit: null,
        city: null,
        assignedSellerId: ownerUserId,
        priceLevelId,
        salesPriceListId: null,
        dueDays: null,
        taxCondition: null,
      },
    ],
    products: [
      {
        id: "00000000-0000-4000-8000-000000000004",
        name: "Producto de prueba offline",
        sku: "PWA-TEST",
        brand: null,
        price: 100,
        currency: "ARS",
        supplierId: null,
        supplierName: null,
        categoryId: null,
        categoryName: null,
        unitOfMeasure: "UN",
        tracksStockUnits: false,
        totalQuantity: 10,
        totalUnitQuantity: null,
        averageQuantityPerUnit: null,
        weightPerUnit: null,
        unitsPerBox: null,
        boxesPerPallet: null,
        taxes: [],
        priceByLevel: [{ priceLevelId, price: 120 }],
      },
    ],
    priceLevels: [
      {
        id: priceLevelId,
        name: "Nivel firmado",
        margin: 40,
        validFrom: null,
        isActive: true,
        extraCommissionRate: null,
        status: "Active",
      },
    ],
    taxes: [],
    sellers: [{ id: ownerUserId, name: "Vendedor de prueba" }],
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
