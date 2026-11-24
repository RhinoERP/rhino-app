import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  getSalesAccessContext: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesAccessContext: mocks.getSalesAccessContext,
}));

import {
  type ChessHistoricalSalesDocument,
  getChessHistoricalSalesExport,
  getChessHistoricalSalesPage,
} from "./chess-historical-sales.service";

type QueryCall = {
  table: string;
  from: number;
  to: number;
  orFilters: string[];
};

function createHistoricalDocument(index: number): ChessHistoricalSalesDocument {
  return {
    id: `document-${index}`,
    source_key: `source-${index}`,
    document_code: "FCVTA",
    document_name: "Factura de venta",
    document_letter: "A",
    document_series: 2,
    document_number: index + 1,
    printed_number: `A 00002-${String(index + 1).padStart(8, "0")}`,
    document_class: "SALE",
    revenue_sign: 1,
    is_fiscal: true,
    is_reference_only: false,
    customer_chess_code: "SHERATON",
    document_date: "2026-10-01",
    cancelled: false,
    settlement_status: "UNVERIFIED",
    gross_amount: 100,
    discount_amount: 0,
    net_taxable_amount: 100,
    net_other_amount: 0,
    non_taxable_amount: 0,
    exempt_amount: 0,
    vat_1_amount: 21,
    vat_1_fiscal_amount: 21,
    vat_2_amount: 0,
    perception_212_amount: 0,
    perception_3337_amount: 0,
    perception_iibb_amount: 0,
    internal_tax_amount: 0,
    detraccion_amount: 0,
    total_amount: 121,
    customer: {
      business_name: "Hotel Sheraton",
      fantasy_name: "Hotel Sheraton",
    },
  };
}

function mockSupabase({
  customerIds = ["customer-sheraton"],
  documents,
}: {
  customerIds?: string[];
  documents: ChessHistoricalSalesDocument[];
}) {
  const queryCalls: QueryCall[] = [];
  const orFilters: Array<{ table: string; filter: string }> = [];

  mocks.createClient.mockResolvedValue({
    from(table: string) {
      let from = 0;
      let to = documents.length;
      const call: QueryCall = { table, from, to, orFilters: [] };
      queryCalls.push(call);

      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lte: () => query,
        order: () => query,
        limit: () => query,
        or(filter: string) {
          call.orFilters.push(filter);
          orFilters.push({ table, filter });
          return query;
        },
        range(start: number, end: number) {
          from = start;
          to = end;
          call.from = start;
          call.to = end;
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
        then(resolve: (value: unknown) => unknown) {
          const data =
            table === "customers"
              ? customerIds.map((id) => ({ id }))
              : documents.slice(from, to + 1);
          const count =
            table === "customers" ? customerIds.length : documents.length;
          return Promise.resolve({ data, count, error: null }).then(resolve);
        },
      };
      return query;
    },
  });

  return { queryCalls, orFilters };
}

describe("CHESS historical sales query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationBySlug.mockResolvedValue({ id: "org-1" });
    mocks.getSalesAccessContext.mockResolvedValue({
      canRead: true,
      canViewAll: true,
    });
  });

  it("searches customer names and keeps the document query builder chainable", async () => {
    const document = createHistoricalDocument(0);
    const { orFilters } = mockSupabase({ documents: [document] });

    const result = await getChessHistoricalSalesPage("org", {
      page: 1,
      pageSize: 20,
      search: "SHERATON",
    });

    expect(result?.data).toEqual([document]);
    expect(orFilters).toEqual([
      {
        table: "customers",
        filter:
          'business_name.ilike."%SHERATON%",fantasy_name.ilike."%SHERATON%"',
      },
      {
        table: "historical_sales_documents",
        filter:
          'printed_number.ilike."%SHERATON%",document_code.ilike."%SHERATON%",customer_id.in.(customer-sheraton)',
      },
    ]);
  });

  it("exports all matching rows in stable-sized server batches", async () => {
    const documents = Array.from({ length: 501 }, (_, index) =>
      createHistoricalDocument(index)
    );
    const { queryCalls } = mockSupabase({
      customerIds: [],
      documents,
    });

    const result = await getChessHistoricalSalesExport("org", {
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      documentCode: "FCVTA",
    });

    expect(result).toHaveLength(501);
    expect(
      queryCalls
        .filter((call) => call.table === "historical_sales_documents")
        .map(({ from, to }) => [from, to])
    ).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });
});
