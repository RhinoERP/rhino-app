import { describe, expect, it } from "vitest";
import {
  originalQuoteQuantities,
  receivedBadgesByItem,
} from "./original-quote-quantities";

describe("cantidad original en revisión de stock", () => {
  it("muestra 5 M como necesarias en ambas porciones, aunque solo 1 se recibió", () => {
    const totals = originalQuoteQuantities([
      { id: "m-pendiente", parent_quote_item_id: null, quantity: 4 },
      { id: "m-recibida", parent_quote_item_id: "m-pendiente", quantity: 1 },
      { id: "xl", parent_quote_item_id: null, quantity: 5 },
    ]);
    expect(totals.get("m-recibida")).toBe(5);
    expect(totals.get("m-pendiente")).toBe(5);
    expect(totals.get("xl")).toBe(5);
  });

  it("conserva la cantidad original tras múltiples subdivisiones y no agrupa líneas independientes", () => {
    const totals = originalQuoteQuantities([
      { id: "base", parent_quote_item_id: null, quantity: 2 },
      { id: "primera", parent_quote_item_id: "base", quantity: 1 },
      { id: "segunda", parent_quote_item_id: "primera", quantity: 2 },
      { id: "otra-linea", parent_quote_item_id: null, quantity: 3 },
    ]);
    expect(totals.get("segunda")).toBe(5);
    expect(totals.get("base")).toBe(5);
    expect(totals.get("otra-linea")).toBe(3);
  });

  it("no falla si un ítem antiguo apunta a una línea que ya no existe", () => {
    const totals = originalQuoteQuantities([
      { id: "historico", parent_quote_item_id: "eliminado", quantity: 2 },
    ]);
    expect(totals.get("historico")).toBe(2);
  });
});

describe("badge de mercadería recibida", () => {
  it("marca parcialmente cuando se recibió 1 de 5 aunque el resto siga en compra", () => {
    const badges = receivedBadgesByItem({
      portions: [
        {
          id: "m-pendiente",
          parent_quote_item_id: null,
          quantity: 4,
          assigned_order_id: "child-purchase",
        },
        {
          id: "m-recibida",
          parent_quote_item_id: "m-pendiente",
          quantity: 1,
          assigned_order_id: "child-ready",
        },
        {
          id: "xl",
          parent_quote_item_id: null,
          quantity: 5,
          assigned_order_id: "child-ready-xl",
        },
      ],
      statusByChildId: new Map([
        ["child-purchase", "PURCHASING"],
        ["child-ready", "GOODS_RECEIVED"],
        ["child-ready-xl", "GOODS_RECEIVED"],
      ]),
    });
    expect(badges.get("m-recibida")).toBe("partial_goods");
    expect(badges.get("xl")).toBe("goods");
    expect(badges.has("m-pendiente")).toBe(false);
  });

  it("sigue parcial si se cierra con faltante y las 4 restantes vuelven sin asignar", () => {
    const badges = receivedBadgesByItem({
      portions: [
        {
          id: "m-pendiente",
          parent_quote_item_id: null,
          quantity: 4,
          assigned_order_id: null,
        },
        {
          id: "m-recibida",
          parent_quote_item_id: "m-pendiente",
          quantity: 1,
          assigned_order_id: "child-ready",
        },
      ],
      statusByChildId: new Map([["child-ready", "GOODS_RECEIVED"]]),
    });
    expect(badges.get("m-recibida")).toBe("partial_goods");
  });

  it("marca recibida cuando varias entregas completan la línea", () => {
    const badges = receivedBadgesByItem({
      portions: [
        {
          id: "m-base",
          parent_quote_item_id: null,
          quantity: 3,
          assigned_order_id: "child-ready-1",
        },
        {
          id: "m-extra",
          parent_quote_item_id: "m-base",
          quantity: 2,
          assigned_order_id: "child-ready-2",
        },
      ],
      statusByChildId: new Map([
        ["child-ready-1", "GOODS_RECEIVED"],
        ["child-ready-2", "GOODS_RECEIVED"],
      ]),
    });
    expect(badges.get("m-base")).toBe("goods");
    expect(badges.get("m-extra")).toBe("goods");
  });

  it("no mezcla líneas independientes del mismo producto", () => {
    const badges = receivedBadgesByItem({
      portions: [
        {
          id: "linea-a",
          parent_quote_item_id: null,
          quantity: 5,
          assigned_order_id: "child-a",
        },
        {
          id: "linea-b-pendiente",
          parent_quote_item_id: null,
          quantity: 2,
          assigned_order_id: "child-b-purchase",
        },
        {
          id: "linea-b-recibida",
          parent_quote_item_id: "linea-b-pendiente",
          quantity: 1,
          assigned_order_id: "child-b-ready",
        },
      ],
      statusByChildId: new Map([
        ["child-a", "GOODS_RECEIVED"],
        ["child-b-purchase", "PURCHASING"],
        ["child-b-ready", "GOODS_RECEIVED"],
      ]),
    });
    expect(badges.get("linea-a")).toBe("goods");
    expect(badges.get("linea-b-recibida")).toBe("partial_goods");
  });
});
