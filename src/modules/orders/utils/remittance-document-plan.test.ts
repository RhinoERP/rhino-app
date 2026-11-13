import { describe, expect, it } from "vitest";
import {
  planRemittanceDocuments,
  type RemittancePlanRow,
} from "./remittance-document-plan";

function row(index: number, orderId = "child-a"): RemittancePlanRow {
  return {
    source: {
      id: `item-${String(index).padStart(3, "0")}`,
      orderId,
      product_id: `product-${index}`,
      product_variant_id: null,
    },
    item: {
      sku: `sku-${index}`,
      name: `Producto ${String(index).padStart(3, "0")}`,
      quantity: 20,
      unitOfMeasure: "UN",
      unitPrice: 10,
      subtotal: 200,
    },
  };
}

describe("planRemittanceDocuments", () => {
  it.each([
    [26, [26]],
    [27, [26, 1]],
    [52, [26, 26]],
    [53, [26, 26, 1]],
  ])("distributes %i printable lines without losing origins", (count, sizes) => {
    const input = Array.from({ length: count }, (_, index) => row(index));
    const documents = planRemittanceDocuments(input);
    expect(documents.map((document) => document.lines.length)).toEqual(sizes);
    expect(
      documents
        .flatMap((document) => document.lines)
        .flatMap((line) => line.sources)
    ).toHaveLength(count);
    expect(
      documents.every((document) =>
        document.lines.every((line, index) => line.line_position === index + 1)
      )
    ).toBe(true);
    expect(input[0].item.quantity).toBe(20);
  });

  it("groups identical products across children while preserving both quantities", () => {
    const first = row(1);
    const second = row(1, "child-b");
    second.source.id = "another-item";
    const documents = planRemittanceDocuments([first, second]);
    expect(documents[0].lines).toHaveLength(1);
    expect(documents[0].lines[0].quantity).toBe(40);
    expect(documents[0].lines[0].sources).toEqual([
      { order_id: "child-b", quote_item_id: "another-item", quantity: 20 },
      { order_id: "child-a", quote_item_id: first.source.id, quantity: 20 },
    ]);
    expect(documents[0].total).toBe(400);
  });

  it("does not merge different prices, variants, extras, or weighted lines", () => {
    const rows = Array.from({ length: 5 }, (_, index) => {
      const result = row(1);
      result.source.id = `origin-${index}`;
      return result;
    });
    rows[1].item.unitPrice = 11;
    rows[2].source.product_variant_id = "variant";
    rows[3].item.extras = [{ description: "Bordado", unitPrice: 2 }];
    rows[4].item.weightQuantity = 1;
    expect(planRemittanceDocuments(rows)[0].lines).toHaveLength(5);
  });

  it("keeps page membership stable when query results arrive in reverse order", () => {
    const rows = Array.from({ length: 53 }, (_, index) => row(index));
    expect(planRemittanceDocuments([...rows].reverse())).toEqual(
      planRemittanceDocuments(rows)
    );
  });

  it("groups before splitting and calculates declared value from each document", () => {
    const rows = Array.from({ length: 26 }, (_, index) => row(index));
    const duplicate = row(0, "child-b");
    duplicate.source.id = "second-origin";
    rows[1].item.discountPercentage = 10;
    const documents = planRemittanceDocuments([...rows, duplicate]);
    expect(documents).toHaveLength(1);
    expect(documents[0].subtotal).toBe(5400);
    expect(documents[0].discountTotal).toBe(20);
    expect(documents[0].total).toBe(5380);
    expect(documents[0].suggestedDeclaredValue).toBe(3766);
  });

  it("rejects duplicate sources, empty selections and invalid quantities", () => {
    expect(() => planRemittanceDocuments([row(0), row(0)])).toThrow("repetido");
    expect(() => planRemittanceDocuments([])).toThrow("No hay productos");
    for (const quantity of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0.000_000_1,
    ]) {
      const invalid = row(0);
      invalid.item.quantity = quantity;
      expect(() => planRemittanceDocuments([invalid])).toThrow("inválidos");
    }
  });
});
