import { describe, expect, it } from "vitest";
import {
  buildHistoricalTextSearchConditions,
  normalizeHistoricalSearch,
  quotePostgrestFilterValue,
} from "./chess-historical-search";

describe("CHESS historical search filters", () => {
  it("preserves punctuation in customer names while quoting filter values", () => {
    const search = 'Droguería "Centro", S.A. (Norte)';

    expect(buildHistoricalTextSearchConditions(search)).toEqual([
      'printed_number.ilike."%Droguería \\"Centro\\", S.A. (Norte)%"',
      'document_code.ilike."%Droguería \\"Centro\\", S.A. (Norte)%"',
    ]);
  });

  it("escapes backslashes and quotes for PostgREST filter expressions", () => {
    expect(quotePostgrestFilterValue('Casa \\ "Norte"')).toBe(
      '"Casa \\\\ \\"Norte\\""'
    );
  });

  it("trims and caps search input length", () => {
    expect(normalizeHistoricalSearch("  cliente  ")).toBe("cliente");
    expect(normalizeHistoricalSearch("x".repeat(120))).toHaveLength(100);
  });
});
