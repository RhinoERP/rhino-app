import { z } from "zod";

export const SELLER_OFFLINE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

const paymentMethodSchema = z.enum([
  "efectivo",
  "tarjeta_de_credito",
  "tarjeta_de_debito",
  "transferencia",
  "qr",
  "cheque",
  "deposito",
  "e-cheq",
]);

const invoiceTypeSchema = z.enum([
  "NOTA_DE_VENTA",
  "FACTURA_A",
  "FACTURA_A_RETENCION",
  "FACTURA_B",
  "FACTURA_C",
  "FACTURA_E",
]);

export const offlineOrganizationSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  cuit: z.string().nullable(),
});

export const offlineCustomerSchema = z.object({
  id: z.string().uuid(),
  businessName: z.string().min(1),
  fantasyName: z.string().nullable(),
  clientNumber: z.string().nullable(),
  cuit: z.string().nullable(),
  city: z.string().nullable(),
  assignedSellerId: z.string().uuid().nullable(),
  salesPriceListId: z.string().uuid().nullable(),
  dueDays: z.number().int().nonnegative().nullable(),
  taxCondition: z.string().nullable(),
});

export const offlineProductTaxSchema = z.object({
  taxId: z.string().uuid(),
  name: z.string().min(1),
  rate: z.number().finite(),
  code: z.string().nullable(),
});

export const offlineProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  sku: z.string(),
  brand: z.string().nullable(),
  price: z.number().finite().nonnegative(),
  currency: z.string().min(1),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  unitOfMeasure: z.enum(["UN", "KG", "LT", "MT"]),
  tracksStockUnits: z.boolean(),
  totalQuantity: z.number().finite().nullable(),
  totalUnitQuantity: z.number().finite().nullable(),
  averageQuantityPerUnit: z.number().finite().nullable(),
  weightPerUnit: z.number().finite().nullable(),
  unitsPerBox: z.number().finite().nullable(),
  boxesPerPallet: z.number().finite().nullable(),
  taxes: z.array(offlineProductTaxSchema),
});

export const offlineTaxSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  rate: z.number().finite(),
  code: z.string().nullable(),
  isFavoriteSales: z.boolean(),
});

export const offlineSellerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});

export const offlinePriceListSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(["PERCENTAGE", "PRICE"]),
  value: z.number().finite(),
  validFrom: z.string(),
});

export const offlineAssignmentSchema = z.object({
  customerId: z.string().uuid(),
  supplierId: z.string().uuid(),
  purchasePriceListId: z.string().uuid().nullable(),
  salesPriceListId: z.string().uuid().nullable(),
});

export const offlinePurchasePriceListItemSchema = z.object({
  priceListId: z.string().uuid(),
  productId: z.string().uuid(),
  costPrice: z.number().finite().nonnegative(),
  margin: z.number().finite().nullable(),
});

export const offlineSalesSettingsSchema = z.object({
  purgeAfterHours: z.number().int().min(1),
  configurablePriceListsEnabled: z.boolean(),
  dueDaysEnabled: z.boolean(),
  dueDaysDefault: z.number().int().min(1),
  defaultTaxIds: z.array(z.string().uuid()),
  enabledPaymentMethods: z.array(paymentMethodSchema),
  defaultPaymentMethod: paymentMethodSchema,
  defaultInvoiceType: invoiceTypeSchema,
});

export const sellerOfflineSnapshotV1Schema = z
  .object({
    schemaVersion: z.literal(SELLER_OFFLINE_SNAPSHOT_SCHEMA_VERSION),
    snapshotId: z.string().uuid(),
    generatedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    ownerUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    organization: offlineOrganizationSchema,
    customers: z.array(offlineCustomerSchema),
    products: z.array(offlineProductSchema),
    taxes: z.array(offlineTaxSchema),
    sellers: z.array(offlineSellerSchema),
    salesPriceLists: z.array(offlinePriceListSchema),
    customerPriceAssignments: z.array(offlineAssignmentSchema),
    purchasePriceListItems: z.array(offlinePurchasePriceListItemSchema),
    settings: offlineSalesSettingsSchema,
  })
  .superRefine((snapshot, context) => {
    if (snapshot.organization.id !== snapshot.organizationId) {
      context.addIssue({
        code: "custom",
        message: "La organizacion del snapshot no coincide con su particion",
        path: ["organization", "id"],
      });
    }

    if (Date.parse(snapshot.expiresAt) <= Date.parse(snapshot.generatedAt)) {
      context.addIssue({
        code: "custom",
        message: "El vencimiento debe ser posterior a la generacion",
        path: ["expiresAt"],
      });
    }
  });

export type SellerOfflineSnapshotV1 = z.infer<
  typeof sellerOfflineSnapshotV1Schema
>;
export type OfflineCustomer = z.infer<typeof offlineCustomerSchema>;
export type OfflineProduct = z.infer<typeof offlineProductSchema>;
