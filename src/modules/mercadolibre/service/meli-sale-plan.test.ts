import { describe, expect, it } from "vitest";
import {
  type CreateMeliSaleInput,
  createMeliSaleSchema,
  type MeliLot,
  type MeliProduct,
} from "../types";
import { buildMeliSalePlan } from "./meli-sale-plan";

const productId = "00000000-0000-4000-8000-000000000001";
const warehouseId = "00000000-0000-4000-8000-000000000002";
const taxId = "00000000-0000-4000-8000-000000000003";
const variantId = "00000000-0000-4000-8000-000000000004";
const input: CreateMeliSaleInput = {
  orgSlug: "org",
  warehouseId,
  marketplaceOrderNumber: "MELI-0001",
  idempotencyKey: "00000000-0000-4000-8000-000000000005",
  saleDate: "2026-11-15",
  receiver: {
    version: 1,
    tax_condition: "CONSUMIDOR_FINAL",
    document_type: "DNI",
    document_number: "12.345.678",
    first_name: "Ana",
    last_name: "Pérez",
    address: "Calle 123",
  },
  invoiceType: "FACTURA_B",
  items: [{ productId, quantity: 2, unitPrice: 100 }],
};
const product: MeliProduct = {
  id: productId,
  name: "Producto",
  is_active: true,
  has_variants: false,
  unit_of_measure: "UN",
  tracks_stock_units: false,
};
const lot: MeliLot = {
  id: "00000000-0000-4000-8000-000000000006",
  product_id: productId,
  product_variant_id: null,
  quantity_available: 10,
  unit_quantity_available: null,
  expiration_date: null,
  created_at: "2026-01-01T00:00:00Z",
  lot_number: "L1",
};
function plan(
  overrides: Partial<CreateMeliSaleInput> = {},
  products = [product],
  lots = [lot]
) {
  return buildMeliSalePlan({
    input: createMeliSaleSchema.parse({ ...input, ...overrides }),
    products,
    lots,
    basePrices: new Map([[productId, 150]]),
    productTaxes: new Map([
      [
        productId,
        [{ taxId, name: "IVA", rate: 21, taxCodeSnapshot: "IVA_21" }],
      ],
    ]),
    fallbackTaxes: [],
  });
}

describe("Meli buyer validation", () => {
  it("requires an identified buyer even without a permanent customer", () => {
    expect(
      createMeliSaleSchema.safeParse({ ...input, receiver: undefined }).success
    ).toBe(false);
    const parsed = createMeliSaleSchema.parse(input);
    expect(parsed.customerId).toBeNull();
    expect(parsed.receiver.document_number).toBe("12345678");
  });
  it("accepts a registered customer and an occasional RI snapshot", () => {
    const parsed = createMeliSaleSchema.parse({
      ...input,
      customerId: productId,
      invoiceType: "FACTURA_A",
      receiver: {
        version: 1,
        tax_condition: "RESPONSABLE_INSCRIPTO",
        document_type: "CUIT",
        document_number: "30-71183339-7",
        business_name: "Empresa",
        address: "Calle 123",
      },
    });
    expect(parsed.customerId).toBe(productId);
    expect(parsed.receiver.document_number).toBe("30711833397");
  });
  it("rejects A for CF, malformed documents and missing USD rate", () => {
    expect(
      createMeliSaleSchema.safeParse({ ...input, invoiceType: "FACTURA_A" })
        .success
    ).toBe(false);
    expect(
      createMeliSaleSchema.safeParse({
        ...input,
        receiver: { ...input.receiver, document_number: "abc12345678" },
      }).success
    ).toBe(false);
    expect(
      createMeliSaleSchema.safeParse({ ...input, currency: "USD" }).success
    ).toBe(false);
  });
});

describe("Meli commercial and stock plan", () => {
  it("does not lose cents while aggregating the maximum number of checkout lines", () => {
    const result = plan(
      {
        items: Array.from({ length: 500 }, () => ({
          productId,
          quantity: 1,
          unitPrice: 1.01,
        })),
      },
      [product],
      [{ ...lot, quantity_available: 500 }]
    );
    expect(
      result.items.reduce(
        (sum, item) => sum + Number(item.subtotal.toFixed(2).replace(".", "")),
        0
      )
    ).toBe(50_500);
    expect(result.total_amount).toBe(611.05);
  });
  it("keeps an explicitly supplied foreign-currency price and converts only its reference", () => {
    const result = plan({ currency: "USD", commercialExchangeRate: 1000 });
    expect(result.items[0]).toMatchObject({
      unit_price: 100,
      base_price: 0.15,
    });
    expect(result.total_amount).toBe(242);
  });
  it("preserves the edited price, records the direct-sale reference and snapshots taxes", () => {
    const result = plan();
    expect(result.items[0]).toMatchObject({
      base_price: 150,
      unit_price: 100,
      subtotal: 200,
      allocations: [{ lot_id: lot.id, quantity: 2, unit_quantity: 0 }],
      taxes: [{ base_amount: 200, tax_amount: 42 }],
    });
    expect(result.total_amount).toBe(242);
    expect(result.receiver.document_number).toBe("12345678");
    expect(lot.quantity_available).toBe(10);
  });
  it("uses shared item/global discount tax calculations", () => {
    const result = plan({
      items: [{ productId, quantity: 2, unitPrice: 100, discountAmount: 20 }],
      globalDiscountPercentage: 10,
    });
    expect(result.global_discount_amount).toBe(18);
    expect(result.items[0].taxes[0]).toMatchObject({
      base_amount: 162,
      tax_amount: 34.02,
    });
    expect(result.total_amount).toBe(196.02);
  });
  it("orders FIFO deterministically when expiration dates are absent", () => {
    const newer = { ...lot, id: variantId, created_at: "2026-02-01T00:00:00Z" };
    const result = plan(
      { items: [{ productId, quantity: 11, unitPrice: 100 }] },
      [product],
      [newer, lot]
    );
    expect(
      result.items[0].allocations.map((a) => [a.lot_id, a.quantity])
    ).toEqual([
      [lot.id, 10],
      [newer.id, 1],
    ]);
  });
  it("does not allocate the same stock twice for repeated product lines", () => {
    expect(() =>
      plan({
        items: [
          { productId, quantity: 6, unitPrice: 100 },
          { productId, quantity: 6, unitPrice: 100 },
        ],
      })
    ).toThrow("stock suficiente");
    expect(lot.quantity_available).toBe(10);
  });
  it("does not consume another variant's lots", () => {
    expect(() =>
      plan(
        {
          items: [
            {
              productId,
              productVariantId: variantId,
              quantity: 1,
              unitPrice: 100,
            },
          ],
        },
        [{ ...product, has_variants: true }],
        [lot]
      )
    ).toThrow("stock suficiente");
  });
  it("requires integer units and a weight for measured pieces", () => {
    expect(() =>
      plan({ items: [{ productId, quantity: 1.5, unitPrice: 100 }] })
    ).toThrow("entera");
    expect(() =>
      plan({}, [
        { ...product, unit_of_measure: "KG", tracks_stock_units: true },
      ])
    ).toThrow("peso");
    const result = plan(
      {
        items: [{ productId, quantity: 2, weightQuantity: 3, unitPrice: 100 }],
      },
      [{ ...product, unit_of_measure: "KG", tracks_stock_units: true }],
      [{ ...lot, unit_quantity_available: 10 }]
    );
    expect(result.items[0].allocations[0]).toMatchObject({
      quantity: 3,
      unit_quantity: 2,
    });
    expect(result.total_amount).toBe(363);
  });
});
