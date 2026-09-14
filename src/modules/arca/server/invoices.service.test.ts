import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import {
  type ArcaRelatedFiscalDocument,
  buildAuthorizedArcaInvoiceGroups,
} from "./invoices.service";

function makeSale(
  overrides: Partial<SalesOrderWithCustomer> = {}
): SalesOrderWithCustomer {
  return {
    id: "sale-1",
    sale_number: 1,
    invoice_number: "0001-00000001",
    invoice_type: "FACTURA_A",
    arca_status: "authorized",
    arca_authorized_at: "2026-09-01T10:00:00.000Z",
    arca_cae: "cae-1",
    arca_point_of_sale: 1,
    arca_voucher_number: 1,
    total_amount: 1000,
    status: "CONFIRMED",
    sale_date: "2026-09-01",
    user_id: "seller-1",
    document_type: "STANDARD",
    parent_sales_order_id: null,
    preventa_status: null,
    invoice_email_status: "sent",
    invoice_email_recipient: "cliente@example.com",
    invoice_email_delivered_at: null,
    invoice_email_sent_at: null,
    customer: {
      id: "customer-1",
      business_name: "Cliente SA",
      fantasy_name: null,
      email: "cliente@example.com",
    },
    seller: { id: "seller-1", name: "Vendedora" },
    ...overrides,
  } as unknown as SalesOrderWithCustomer;
}

function makeDocument(
  overrides: Partial<ArcaRelatedFiscalDocument> = {}
): ArcaRelatedFiscalDocument {
  return {
    id: "advance-1",
    source: "sales_order",
    kind: "advance",
    invoice_number: "0001-00000002",
    invoice_type: "FACTURA_A",
    arca_authorized_at: "2026-09-02T10:00:00.000Z",
    arca_cae: "cae-advance",
    arca_point_of_sale: 1,
    arca_voucher_number: 2,
    total_amount: 300,
    ...overrides,
  };
}

describe("buildAuthorizedArcaInvoiceGroups", () => {
  it("keeps a normal final sale as the parent and orders its fiscal documents", () => {
    const sale = makeSale();
    const groups = buildAuthorizedArcaInvoiceGroups({
      sales: [sale],
      posSales: [],
      relatedDocumentsBySaleId: new Map([
        [
          sale.id,
          [
            makeDocument({
              id: "credit-note-1",
              source: "credit_note",
              kind: "credit_note",
              invoice_number: "0001-00000003",
              invoice_type: "NOTA_DE_CREDITO_A",
              arca_authorized_at: "2026-09-03T10:00:00.000Z",
            }),
            makeDocument(),
          ],
        ],
      ]),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: sale.id,
      group_kind: "sale",
      is_primary_authorized: true,
    });
    expect(groups[0].related_documents.map((document) => document.id)).toEqual([
      "advance-1",
      "credit-note-1",
    ]);
  });

  it("groups preventa advances and its authorized balance without duplicating the balance", () => {
    const preventa = makeSale({
      id: "preventa-1",
      sale_number: 7,
      arca_status: "pending",
      arca_authorized_at: null,
      invoice_number: null,
      preventa_status: "CONVERTIDA_A_VENTA",
    });
    const balance = makeSale({
      id: "balance-1",
      sale_number: 8,
      invoice_number: "0001-00000008",
      document_type: "BALANCE",
      parent_sales_order_id: preventa.id,
      arca_authorized_at: "2026-09-04T10:00:00.000Z",
    });

    const groups = buildAuthorizedArcaInvoiceGroups({
      sales: [preventa, balance],
      posSales: [],
      relatedDocumentsBySaleId: new Map([
        [preventa.id, [makeDocument({ id: "advance-preventa" })]],
      ]),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(preventa.id);
    expect(groups[0].group_kind).toBe("preventa");
    expect(
      groups[0].related_documents.map((document) => document.kind)
    ).toEqual(["advance", "balance"]);
  });

  it("does not expose a non-authorized parent without authorized related documents", () => {
    const groups = buildAuthorizedArcaInvoiceGroups({
      sales: [
        makeSale({
          arca_status: "pending",
          arca_authorized_at: null,
          invoice_number: null,
        }),
      ],
      posSales: [],
      relatedDocumentsBySaleId: new Map(),
    });

    expect(groups).toEqual([]);
  });
});
