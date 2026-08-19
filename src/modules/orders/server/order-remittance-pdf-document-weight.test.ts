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

import { getOrderRemittanceData } from "./order-remittance-pdf-document.service";

describe("getOrderRemittanceData", () => {
  it("uses the sales item unit quantity as remittance weight", async () => {
    const from = vi.fn((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  order_number: 12,
                  observations: null,
                  quote_id: "quote-1",
                  sales_order_id: null,
                  parent_order_id: null,
                  quotes: { customer_id: "customer-1" },
                },
              }),
            })),
          })),
        };
      }

      if (table === "quote_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "quote-item-1",
                  description: "Carne",
                  quantity: 2,
                  unit_price: 100,
                  subtotal: 200,
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
                  quantity: 2,
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
      childOrderId: "order-1",
      remitoNumber: "R-0001",
    });

    expect(remittance.items[0]?.weightQuantity).toBe(4.5);
    expect(remittance.finalRemittanceVisibility?.showWeight).toBe(true);
    expect(generateRemittanceHTML(remittance)).toContain("Peso</th>");
  });
});
