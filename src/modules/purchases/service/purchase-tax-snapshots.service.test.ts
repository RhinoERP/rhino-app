import { describe, expect, it, vi } from "vitest";
import type { createClient } from "@/lib/supabase/server";
import { getProductTaxAssignments } from "@/modules/taxes/product-tax.service";
import {
  buildPurchaseTaxPlan,
  parsePurchaseTaxInputs,
  persistPurchaseFiscalState,
  resolvePurchaseTaxSelections,
  tryParsePurchaseTaxInputs,
} from "./purchase-tax-snapshots.service";

vi.mock("@/modules/taxes/product-tax.service", () => ({
  getProductTaxAssignments: vi.fn(),
}));

const productTax = {
  taxId: "iva-21",
  name: "IVA 21%",
  rate: 21,
  taxCodeSnapshot: "IVA_21",
  source: "product" as const,
};
const fallbackTax = {
  taxId: "iva-105",
  name: "IVA 10.5%",
  rate: 10.5,
  taxCodeSnapshot: "IVA_10_5",
  source: "fallback" as const,
};

describe("impuestos por ítem de compra", () => {
  it("valida los JSON fiscales antes de usarlos en el recálculo", () => {
    expect(parsePurchaseTaxInputs([productTax])).toEqual([productTax]);
    expect(parsePurchaseTaxInputs([])).toEqual([]);
    expect(() => parsePurchaseTaxInputs({ taxId: "iva-21" })).toThrow(
      "formato inválido"
    );
    expect(() =>
      parsePurchaseTaxInputs([{ ...productTax, rate: "21" }])
    ).toThrow("formato inválido");
    expect(() =>
      parsePurchaseTaxInputs([{ ...productTax, source: "unknown" }])
    ).toThrow("formato inválido");
    expect(
      tryParsePurchaseTaxInputs([{ ...productTax, rate: "21" }])
    ).toBeNull();
  });

  it("obtiene tasa y código del catálogo para impuestos nuevos, no del cliente", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                {
                  id: "iva-21",
                  name: "IVA real",
                  rate: 21,
                  code: "IVA_21",
                  is_active: true,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>;
    const result = await resolvePurchaseTaxSelections({
      supabase,
      orgId: "org-id",
      lines: [
        {
          taxes: [
            {
              taxId: "iva-21",
              name: "IVA falso",
              rate: 999,
              taxCodeSnapshot: "TRIBUTO_02",
            },
          ],
        },
      ],
      fallbackTaxes: [],
    });
    expect(result.lineTaxes[0]).toEqual([
      expect.objectContaining({
        name: "IVA real",
        rate: 21,
        taxCodeSnapshot: "IVA_21",
        source: "manual",
      }),
    ]);
  });

  it("conserva un impuesto congelado inactivo, pero no acepta uno nuevo inactivo o ajeno", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                {
                  id: "iva-21",
                  name: "Nuevo nombre",
                  rate: 10.5,
                  code: "IVA_10_5",
                  is_active: false,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>;
    const input = {
      supabase,
      orgId: "org-id",
      lines: [{ id: "item-1", taxes: [productTax] }],
      fallbackTaxes: [],
    };
    const saved = await resolvePurchaseTaxSelections({
      ...input,
      savedLineTaxes: new Map([["item-1", [productTax]]]),
    });
    expect(saved.lineTaxes[0]).toEqual([productTax]);
    await expect(resolvePurchaseTaxSelections(input)).rejects.toThrow(
      "no está activo"
    );
    await expect(
      resolvePurchaseTaxSelections({
        ...input,
        lines: [{ taxes: [{ ...productTax, taxId: "foreign-org-tax" }] }],
      })
    ).rejects.toThrow("no está activo");
  });

  it("respeta el impuesto de producto, el manual y el fallback incluso tras una recepción parcial", async () => {
    vi.mocked(getProductTaxAssignments).mockResolvedValue(
      new Map([["product-a", [productTax]]])
    );
    const params = {
      supabase: {} as Awaited<ReturnType<typeof createClient>>,
      orgId: "org-id",
      fallbackTaxes: [fallbackTax],
      globalDiscountAmount: 0,
    };
    const lines = [
      { id: "item-a", product_id: "product-a", subtotal: 100 },
      { id: "item-b", product_id: "product-b", subtotal: 100 },
    ];
    const initial = await buildPurchaseTaxPlan({ ...params, lines });
    expect(
      initial.itemTaxes.map((tax) => [tax.lineId, tax.source, tax.taxAmount])
    ).toEqual([
      ["item-a", "product", 21],
      ["item-b", "fallback", 10.5],
    ]);
    expect(initial.totalTaxAmount).toBe(31.5);

    const received = await buildPurchaseTaxPlan({
      ...params,
      lines: [{ ...lines[0], subtotal: 50 }],
    });
    expect(received.itemTaxes).toEqual([
      expect.objectContaining({
        lineId: "item-a",
        source: "product",
        taxAmount: 10.5,
      }),
    ]);
    expect(received.totalTaxAmount).toBe(10.5);

    const manual = await buildPurchaseTaxPlan({
      ...params,
      lines: [
        {
          ...lines[0],
          subtotal: 50,
          taxes: [{ ...fallbackTax, source: "manual" }],
        },
      ],
    });
    expect(manual.itemTaxes).toEqual([
      expect.objectContaining({
        lineId: "item-a",
        source: "manual",
        taxAmount: 5.25,
      }),
    ]);
    expect(manual.totalTaxAmount).toBe(5.25);
  });

  it("permite usar el impuesto de compra aun cuando el producto tenga uno asignado", async () => {
    vi.mocked(getProductTaxAssignments).mockResolvedValue(
      new Map([["product-a", [productTax]]])
    );
    const plan = await buildPurchaseTaxPlan({
      supabase: {} as Awaited<ReturnType<typeof createClient>>,
      orgId: "org-id",
      lines: [
        { id: "item-a", product_id: "product-a", subtotal: 100, taxes: [] },
      ],
      globalDiscountAmount: 0,
      fallbackTaxes: [fallbackTax],
    });
    expect(plan.itemTaxes).toEqual([
      expect.objectContaining({ source: "fallback", taxAmount: 10.5 }),
    ]);
  });

  it("deja sin impuestos el producto no gravado de una pre-compra", async () => {
    vi.mocked(getProductTaxAssignments).mockResolvedValue(new Map());
    const plan = await buildPurchaseTaxPlan({
      supabase: {} as Awaited<ReturnType<typeof createClient>>,
      orgId: "org-id",
      lines: [{ id: "item-b", product_id: "product-b", subtotal: 100 }],
      globalDiscountAmount: 0,
    });
    expect(plan.itemTaxes).toEqual([]);
    expect(plan.totalTaxAmount).toBe(0);
  });

  it("envía ítems, impuestos y total a una sola operación fiscal", async () => {
    vi.mocked(getProductTaxAssignments).mockResolvedValue(
      new Map([["product-a", [productTax]]])
    );
    const plan = await buildPurchaseTaxPlan({
      supabase: {} as Awaited<ReturnType<typeof createClient>>,
      orgId: "org-id",
      lines: [{ id: "item-id", product_id: "product-a", subtotal: 100 }],
      globalDiscountAmount: 0,
    });
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { id: "order-id" }, error: null });
    await persistPurchaseFiscalState({
      supabase: { rpc } as unknown as Awaited<ReturnType<typeof createClient>>,
      orgId: "org-id",
      orderId: "order-id",
      mode: "receipt",
      items: [
        {
          id: "item-id",
          product_id: "product-a",
          quantity: 1,
          unit_quantity: 1,
          unit_cost: 100,
          subtotal: 100,
        },
      ],
      plan,
      subtotal: 100,
      discountAmount: 0,
      discountPercentage: 0,
      fallbackTaxes: [],
      supplierId: "supplier-id",
      purchaseDate: "2026-09-30",
      expirationDate: null,
      remittanceNumber: null,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "persist_purchase_fiscal_state",
      expect.objectContaining({
        p_total_amount: 121,
        p_item_taxes: [
          expect.objectContaining({ line_id: "item-id", tax_amount: 21 }),
        ],
        p_order_taxes: [expect.objectContaining({ tax_amount: 21 })],
      })
    );
  });
});
