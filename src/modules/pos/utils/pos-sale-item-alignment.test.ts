import { describe, expect, it } from "vitest";
import { alignInsertedPosSaleItems } from "./pos-sale-item-alignment";

describe("POS line identity", () => {
  it("asocia dos líneas de la misma variante aunque el insert devuelva otro orden", () => {
    const plans = [
      { payload: { id: "line-a", product_id: "shirt", lot_id: "red-m" } },
      { payload: { id: "line-b", product_id: "shirt", lot_id: "red-m" } },
    ];
    const inserted = [
      { id: "line-b", product_id: "shirt", lot_id: "red-m" },
      { id: "line-a", product_id: "shirt", lot_id: "red-m" },
    ];

    expect(
      alignInsertedPosSaleItems({
        itemPlans: plans,
        insertedItems: inserted,
      }).map((item) => item.id)
    ).toEqual(["line-a", "line-b"]);
  });

  it("rechaza una respuesta con ítems de otra línea", () => {
    expect(() =>
      alignInsertedPosSaleItems({
        itemPlans: [
          { payload: { id: "line-a", product_id: "shirt", lot_id: "red-m" } },
        ],
        insertedItems: [{ id: "line-b", product_id: "shirt", lot_id: "red-m" }],
      })
    ).toThrow("No se pudo vincular");
  });
});
