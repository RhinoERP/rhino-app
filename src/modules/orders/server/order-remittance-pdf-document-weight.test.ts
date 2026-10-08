import { describe, expect, it, vi } from "vitest";
import { generateRemittanceHTML } from "@/modules/sales/service/remittance-generator.service";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  getOrganizationSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("server-only", () => ({}));

vi.mock(
  "@/modules/organizations/actions/get-organization-settings.action",
  () => ({
    getOrganizationSettings: mocks.getOrganizationSettings,
  })
);

vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));

import {
  getOrderRemittanceData,
  groupOrderRemittanceItems,
} from "./order-remittance-pdf-document.service";

describe("groupOrderRemittanceItems", () => {
  const line = {
    sku: "CAMPERA",
    name: "Campera Softshell",
    variantName: "XL · Negro",
    unitOfMeasure: "UN",
    unitPrice: 100,
    discountPercentage: 10,
    extras: [{ description: "Bordado", unitPrice: 20 }],
  };
  const source = {
    id: "original",
    product_id: "campera",
    product_variant_id: "xl-negro",
  };

  it("combines split quantities and their line amounts", () => {
    const items = groupOrderRemittanceItems([
      { source, item: { ...line, quantity: 3, subtotal: 360 } },
      {
        source: { ...source, id: "split" },
        item: { ...line, quantity: 1, subtotal: 120 },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 4, subtotal: 480 });
  });

  it("keeps other variants, prices and extras separate", () => {
    const items = groupOrderRemittanceItems([
      { source, item: { ...line, quantity: 3, subtotal: 360 } },
      {
        source: { ...source, id: "other-variant", product_variant_id: "2xl" },
        item: {
          ...line,
          variantName: "2XL · Negro",
          quantity: 1,
          subtotal: 120,
        },
      },
      {
        source: { ...source, id: "other-price" },
        item: { ...line, unitPrice: 110, quantity: 1, subtotal: 130 },
      },
      {
        source: { ...source, id: "other-extra" },
        item: { ...line, extras: [], quantity: 1, subtotal: 100 },
      },
    ]);

    expect(items).toHaveLength(4);
  });

  it("does not combine weighted items without a reliable split weight", () => {
    const items = groupOrderRemittanceItems([
      {
        source,
        item: { ...line, quantity: 3, subtotal: 360, weightQuantity: 4.5 },
      },
      {
        source: { ...source, id: "split" },
        item: { ...line, quantity: 1, subtotal: 120 },
      },
    ]);

    expect(items).toHaveLength(2);
  });
});

describe("getOrderRemittanceData", () => {
  it("uses assigned split quantities without changing the sales item weight", async () => {
    const from = vi.fn((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  order_number: 12,
                  observations: null,
                  quote_id: "quote-1",
                  sales_order_id: null,
                  parent_order_id: null,
                  quotes: { customer_id: "customer-1" },
                },
              ],
            }),
          })),
        };
      }

      if (table === "quote_items") {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "quote-item-1",
                  description: "Carne",
                  quantity: 3,
                  unit_price: 100,
                  subtotal: 300,
                  discount_percentage: null,
                  quote_item_extras: [],
                  products: {
                    name: "Carne",
                    sku: "CAR-001",
                    brand: null,
                    unit_of_measure: "KG",
                  },
                },
                {
                  id: "quote-item-split",
                  description: "Carne",
                  quantity: 1,
                  unit_price: 100,
                  subtotal: 100,
                  discount_percentage: null,
                  quote_item_extras: [],
                  products: {
                    name: "Carne",
                    sku: "CAR-001",
                    brand: null,
                    unit_of_measure: "KG",
                  },
                },
              ],
            }),
          })),
        };
      }

      if (table === "sales_order_items") {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  quote_item_id: "quote-item-1",
                  description: "Carne",
                  quantity: 4,
                  unit_quantity: 4.5,
                  unit_price: 100,
                  discount_percentage: null,
                },
              ],
            }),
          })),
        };
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  business_name: "Cliente",
                  fantasy_name: null,
                  cuit: null,
                  phone: null,
                  email: null,
                  address: null,
                  city: null,
                  tax_condition: null,
                },
              }),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.createClient.mockResolvedValue({ from });
    mocks.getOrganizationBySlug.mockResolvedValue({
      name: "Empresa",
      cuit: "30-12345678-9",
    });
    mocks.getOrganizationSettings.mockResolvedValue({
      success: true,
      data: {
        remittance_single_page_duplicate: false,
        remittance_final_show_sku: false,
        remittance_final_show_weight: true,
        remittance_final_show_unit_price: false,
        remittance_final_show_discount: false,
        remittance_final_show_line_total: false,
        remittance_final_show_total: false,
      },
    });

    const { remittance } = await getOrderRemittanceData({
      orgSlug: "empresa",
      childOrderIds: ["order-1"],
      remitoNumber: "R-0001",
    });

    expect(remittance.items[0]?.weightQuantity).toBe(4.5);
    expect(remittance.items.map((item) => item.quantity)).toEqual([3, 1]);
    expect(remittance.items.map((item) => item.subtotal)).toEqual([300, 100]);
    expect(remittance.total).toBe(400);
    expect(remittance.finalRemittanceVisibility?.showWeight).toBe(true);
    expect(generateRemittanceHTML(remittance)).toContain("Peso</th>");
  });
});
