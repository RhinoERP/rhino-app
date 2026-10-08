import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertInvoiceDocumentType } from "./sale-invoicing.service";

function mockAdvanceLookup(
  advance: {
    origin_type: string;
    final_sales_order_id: string;
  } | null
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: advance, error: null });
  const limit = vi
    .fn()
    .mockResolvedValue({ data: advance ? [{ id: "a" }] : [], error: null });
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    limit,
    maybeSingle,
  };
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  const from = vi.fn().mockReturnValue({ select: () => query });
  return { supabase: { from } as never, from };
}

const standard = {
  id: "document-1",
  document_type: "STANDARD",
  parent_sales_order_id: null,
  invoice_type: "FACTURA_A" as const,
};

describe("ARCA document type authorization", () => {
  it("allows ordinary sales without an advance lookup", async () => {
    const { supabase, from } = mockAdvanceLookup(null);
    await expect(
      assertInvoiceDocumentType({ supabase, orgId: "org-1", sale: standard })
    ).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it("allows a linked formal advance only through the advance flow", async () => {
    const { supabase } = mockAdvanceLookup({
      origin_type: "PREVENTA",
      final_sales_order_id: "parent-1",
    });
    const sale = {
      ...standard,
      document_type: "ADVANCE",
      parent_sales_order_id: "parent-1",
    };
    await expect(
      assertInvoiceDocumentType({
        supabase,
        orgId: "org-1",
        sale,
        formalAdvanceDocument: "ADVANCE",
      })
    ).resolves.toBeUndefined();
    await expect(
      assertInvoiceDocumentType({ supabase, orgId: "org-1", sale })
    ).rejects.toThrow("no corresponde a una venta");
  });

  it("rejects informal advances even when called from the formal flow", async () => {
    const { supabase, from } = mockAdvanceLookup(null);
    await expect(
      assertInvoiceDocumentType({
        supabase,
        orgId: "org-1",
        sale: {
          ...standard,
          document_type: "ADVANCE",
          invoice_type: "NOTA_DE_VENTA",
          parent_sales_order_id: "parent-1",
        },
        formalAdvanceDocument: "ADVANCE",
      })
    ).rejects.toThrow("no corresponde a una venta");
    expect(from).not.toHaveBeenCalled();
  });

  it("allows a registered formal advance from a completed sale", async () => {
    const { supabase } = mockAdvanceLookup({
      origin_type: "SALE",
      final_sales_order_id: "sale-1",
    });
    await expect(
      assertInvoiceDocumentType({
        supabase,
        orgId: "org-1",
        sale: { ...standard, document_type: "ADVANCE" },
        formalAdvanceDocument: "ADVANCE",
      })
    ).resolves.toBeUndefined();
  });

  it("rejects an advance linked to a different parent", async () => {
    const { supabase } = mockAdvanceLookup({
      origin_type: "PREVENTA",
      final_sales_order_id: "another-parent",
    });
    await expect(
      assertInvoiceDocumentType({
        supabase,
        orgId: "org-1",
        sale: {
          ...standard,
          document_type: "ADVANCE",
          parent_sales_order_id: "parent-1",
        },
        formalAdvanceDocument: "ADVANCE",
      })
    ).rejects.toThrow("no corresponde a una venta");
  });

  it("allows a formal balance with invoiced advances", async () => {
    const { supabase } = mockAdvanceLookup({
      origin_type: "PREVENTA",
      final_sales_order_id: "parent-1",
    });
    await expect(
      assertInvoiceDocumentType({
        supabase,
        orgId: "org-1",
        sale: {
          ...standard,
          document_type: "BALANCE",
          parent_sales_order_id: "parent-1",
        },
        formalAdvanceDocument: "BALANCE",
      })
    ).resolves.toBeUndefined();
  });
});
