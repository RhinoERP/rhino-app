import { describe, expect, it } from "vitest";
import { buildSplitQuoteItemExtras } from "./split-quote-item-extras";

describe("buildSplitQuoteItemExtras", () => {
  it("copies every extra to the split quote item", () => {
    expect(
      buildSplitQuoteItemExtras("split-item-id", [
        { description: "Estampado frente", price: 1200 },
        { description: "Estampado espalda", price: 1800 },
      ])
    ).toEqual([
      {
        quote_item_id: "split-item-id",
        description: "Estampado frente",
        price: 1200,
      },
      {
        quote_item_id: "split-item-id",
        description: "Estampado espalda",
        price: 1800,
      },
    ]);
  });

  it("returns no rows when the source item has no extras", () => {
    expect(buildSplitQuoteItemExtras("split-item-id", [])).toEqual([]);
  });
});
