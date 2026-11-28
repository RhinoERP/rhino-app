import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";
import {
  enrichPurchaseProducts,
  resolvePurchaseDiscountItems,
} from "./purchase-discounts.service";

function client(enabled: boolean, includeTaxes = false) {
  const from = vi.fn((table: string) => {
    const fixtures: Record<string, unknown> = {
      organization_settings: {
        settings: {
          purchase_discounts_enabled: enabled,
          post_invoice_discounts_include_taxes: includeTaxes,
        },
      },
      price_lists: [{ id: "list", habitual_discount_method: "additive" }],
      price_list_items: [
        {
          price_list_id: "list",
          product_id: "product",
          list_price: 104_000,
          discount_1_percentage: 10,
          discount_2_percentage: 20,
        },
      ],
    };
    const data = fixtures[table];
    const query = Object.assign(Promise.resolve({ data, error: null }), {
      select: () => query,
      eq: () => query,
      in: () => query,
      maybeSingle: async () => ({ data, error: null }),
    });
    return query;
  });
  return { supabase: { from } as unknown as SupabaseClient<Database>, from };
}

describe("descuentos en el límite de compras", () => {
  it("deja los productos intactos cuando la organización no está habilitada", async () => {
    const { supabase, from } = client(false);
    const products = [
      {
        id: "product",
        active_price_list_id: "list",
        cost_price: 104_000,
        unit_of_measure: "CAJA",
        units_per_box: 8,
      },
    ];
    expect(await enrichPurchaseProducts(supabase, "org", products)).toBe(
      products
    );
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("copia el método por lista y el precio por unidad individual de CAJA", async () => {
    const { supabase } = client(true, true);
    const products = await enrichPurchaseProducts(supabase, "org", [
      {
        id: "product",
        active_price_list_id: "list",
        cost_price: 72_800,
        unit_of_measure: "CAJA",
        units_per_box: 8,
      },
    ]);
    expect(products[0].purchase_discounts).toMatchObject({
      list_unit_cost: 13_000,
      habitual_discount_method: "additive",
      discount_1_percentage: 10,
      discount_2_percentage: 20,
      post_invoice_discounts_include_taxes: true,
    });
  });
  it("recalcula el costo habitual en servidor sin descontar los beneficios post factura", async () => {
    const { supabase } = client(true);
    const base = {
      quantity: 77,
      unit_quantity: 77,
      unit_of_measure: "CAJA",
      units_per_box: 8,
      unit_cost: 1,
      subtotal: 1,
      list_unit_cost: 13_000,
      discount_1_percentage: 10,
    };
    const [withoutPost] = await resolvePurchaseDiscountItems(supabase, "org", [
      base,
    ]);
    const [withPost] = await resolvePurchaseDiscountItems(supabase, "org", [
      {
        ...base,
        post_invoice_prompt_payment_discount_percentage: 25,
        post_invoice_volume_discount_percentage: 10,
        post_invoice_goods_discount_percentage: 40,
      },
    ]);
    expect(withPost).toMatchObject({ unit_cost: 11_700, subtotal: 900_900 });
    expect(withPost.unit_cost).toBe(withoutPost.unit_cost);
    expect(withPost.subtotal).toBe(withoutPost.subtotal);
    expect(withPost.post_invoice_volume_discount_percentage).toBe(10);
  });
  it("mantiene las líneas antiguas sin consultas ni recálculos", async () => {
    const { supabase, from } = client(false);
    const items = [{ quantity: 2, unit_cost: 100, subtotal: 195 }];
    expect(await resolvePurchaseDiscountItems(supabase, "org", items)).toBe(
      items
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("rechaza descuentos inválidos y su uso con la función apagada", async () => {
    const base = {
      quantity: 1,
      unit_cost: 100,
      subtotal: 100,
      list_unit_cost: 100,
    };
    await expect(
      resolvePurchaseDiscountItems(client(false).supabase, "org", [base])
    ).rejects.toThrow("Solo se pueden conservar");
    await expect(
      resolvePurchaseDiscountItems(client(true).supabase, "org", [
        { ...base, post_invoice_volume_discount_percentage: 101 },
      ])
    ).rejects.toThrow("entre 0 y 100%");
  });

  it("permite cambiar cantidades preservando descuentos al deshabilitar la función", async () => {
    const saved = {
      id: "line",
      product_id: "product",
      list_unit_cost: 100,
      discount_1_percentage: 10,
      post_invoice_volume_discount_percentage: 5,
      post_invoice_discounts_include_taxes: true,
    };
    const [resolved] = await resolvePurchaseDiscountItems(
      client(false).supabase,
      "org",
      [
        {
          ...saved,
          quantity: 2,
          unit_quantity: 2,
          unit_cost: 90,
          subtotal: 180,
        },
      ],
      [saved]
    );
    expect(resolved).toMatchObject({
      id: "line",
      subtotal: 180,
      unit_cost: 90,
      discount_1_percentage: 10,
      post_invoice_volume_discount_percentage: 5,
      post_invoice_discounts_include_taxes: true,
    });
  });

  it("restaura campos omitidos de líneas existentes sin perder su configuración histórica", async () => {
    const saved = {
      id: "line",
      product_id: "product",
      list_unit_cost: 100,
      discount_1_percentage: 10,
      post_invoice_discounts_include_taxes: true,
    };
    const [resolved] = await resolvePurchaseDiscountItems(
      client(false).supabase,
      "org",
      [
        {
          id: "line",
          product_id: "product",
          quantity: 3,
          unit_cost: 1,
          subtotal: 3,
        },
      ],
      [saved]
    );
    expect(resolved).toMatchObject({
      list_unit_cost: 100,
      discount_1_percentage: 10,
      unit_cost: 90,
      subtotal: 270,
      post_invoice_discounts_include_taxes: true,
    });
  });

  it("rechaza cambios, borrado de descuentos y uso de otra identidad cuando están deshabilitados", async () => {
    const saved = {
      id: "line",
      product_id: "product",
      list_unit_cost: 100,
      discount_1_percentage: 10,
    };
    const base = { ...saved, quantity: 1, unit_cost: 90, subtotal: 90 };
    for (const changed of [
      { ...base, discount_1_percentage: 5 },
      { ...base, list_unit_cost: null, discount_1_percentage: 0 },
      { ...base, id: "new-line" },
      { ...base, product_id: "other-product" },
    ]) {
      await expect(
        resolvePurchaseDiscountItems(
          client(false).supabase,
          "org",
          [changed],
          [saved]
        )
      ).rejects.toThrow("Solo se pueden conservar");
    }
  });
});
