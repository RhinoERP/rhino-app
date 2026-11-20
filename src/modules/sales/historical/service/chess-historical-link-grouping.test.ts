import { describe, expect, it } from "vitest";
import { groupChessHistoricalLinks } from "./chess-historical-link-grouping";

describe("groupChessHistoricalLinks", () => {
  it("renders one target invoice while retaining all ten linked product lines", () => {
    const links = Array.from({ length: 10 }, (_, index) => ({
      target_document_id: "invoice-id",
      target_source_key: "1|FCVTA|A|2|89511",
      target_document_code: "FCVTA",
      target_document_name: "FACTURA",
      target_letter: "A",
      target_series: 2,
      target_number: 89_511,
      target_document_date: "2026-10-27",
      target_printed_number: "A 00002-00089511",
      target_relation_type: "CABECERA",
      relation_type: "CREDIT_NOTE_TO_DOCUMENT",
      target_line_number: index + 1,
      target_product_chess_code: `SKU-${index + 1}`,
      target_description: `Producto ${index + 1}`,
    }));

    const grouped = groupChessHistoricalLinks(links);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].target_document_id).toBe("invoice-id");
    expect(grouped[0].related_lines).toHaveLength(10);
  });

  it("keeps target invoices separate and removes duplicate relation lines", () => {
    const base = {
      target_document_id: null,
      target_document_code: "FCVTA",
      target_document_name: "FACTURA",
      target_letter: "A",
      target_series: 2,
      target_number: 10,
      target_document_date: null,
      target_printed_number: null,
      target_relation_type: null,
      relation_type: "CREDIT_NOTE_TO_DOCUMENT",
      target_line_number: 1,
      target_product_chess_code: "SKU-1",
      target_description: "Artículo",
    };

    const grouped = groupChessHistoricalLinks([
      { ...base, target_source_key: "1|FCVTA|A|2|10" },
      { ...base, target_source_key: "1|FCVTA|A|2|10" },
      {
        ...base,
        target_source_key: "1|FCVTA|A|2|11",
        target_number: 11,
      },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].related_lines).toHaveLength(1);
    expect(grouped[1].target_number).toBe(11);
  });
});
