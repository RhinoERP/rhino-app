import { describe, expect, it, vi } from "vitest";
import {
  buildRemittanceMaskData,
  generateRemittanceMaskHTML,
} from "@/modules/sales/service/remittance-mask-generator.service";
import {
  type SavedOrderRemittance,
  savedRemittanceData,
} from "./order-remittance-documents.service";

vi.mock("server-only", () => ({}));

function document(number = "00046"): SavedOrderRemittance {
  return {
    id: `document-${number}`,
    organization_id: "org",
    batch_id: "batch",
    document_number: number,
    document_position: 1,
    issue_date: "2026-11-12",
    status: "ISSUED",
    package_count: null,
    declared_value: null,
    subtotal: 200,
    discount_total: 20,
    total: 180,
    currency: "ARS",
    snapshot_version: 1,
    pdf_url: null,
    created_at: "2026-11-12T15:00:00Z",
    voided_at: null,
    void_reason: null,
    header_snapshot: {
      remittance: {
        type: "REMITO_FINAL",
        date: "2020-01-01",
        taxesTotal: 0,
        issuer: { businessName: "Emisor guardado" },
        customer: { businessName: "Cliente guardado" },
        seller: { name: "Vendedor" },
      },
      carrierName: "Transporte guardado",
      purchaseOrderNumber: "OC-123",
    },
    lines: [
      {
        id: "line",
        organization_id: "org",
        remittance_id: `document-${number}`,
        line_position: 1,
        product_id: "product",
        product_variant_id: "variant",
        sku: "CAMISA",
        product_name: "Camisa de Jean",
        brand: null,
        variant_name: "44 · Denim",
        unit_of_measure: "UN",
        quantity: 20,
        weight_quantity: null,
        unit_price: 10,
        subtotal: 200,
        discount_percentage: 10,
        extras_snapshot: [],
        sources: [
          {
            id: "source",
            organization_id: "org",
            line_id: "line",
            order_id: "child",
            quote_item_id: "item",
            quantity: 20,
          },
        ],
      },
    ],
  };
}

describe("saved remittance snapshots", () => {
  it("uses the saved issue date, prices and receiver rather than the print date", () => {
    const saved = savedRemittanceData(document());
    expect(saved.remittance).toMatchObject({
      documentNumber: "00046",
      date: "2026-11-12",
      subtotal: 200,
      discountTotal: 20,
      total: 180,
      customer: { businessName: "Cliente guardado" },
    });
    expect(saved.remittance.items[0]).toMatchObject({
      quantity: 20,
      unitPrice: 10,
      variantName: "44 · Denim",
    });
    expect(saved.purchaseOrderNumber).toBe("OC-123");
  });

  it("prints distinct document numbers and per-document packages and declared values", () => {
    const first = document();
    const second = document("00047");
    first.package_count = 3;
    first.declared_value = 123.45;
    second.package_count = 8;
    second.declared_value = 456.78;
    second.lines[0].product_name = "Otro producto";
    const masks = [first, second].map((entry) => ({
      ...buildRemittanceMaskData(savedRemittanceData(entry).remittance),
      packageCount: entry.package_count,
      declaredValue: entry.declared_value,
    }));
    const html = generateRemittanceMaskHTML(masks);
    const pages = html.split('<section class="mask-page">').slice(1);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('document-number">00046');
    expect(pages[0]).not.toContain('document-number">00047');
    expect(pages[1]).toContain('document-number">00047');
    expect(pages[0]).toContain("BULTOS:</strong> 3");
    expect(pages[1]).toContain("BULTOS:</strong> 8");
    expect(pages[0]).toContain("123,45");
    expect(pages[1]).toContain("456,78");
    expect(pages[0]).not.toContain("Otro producto");
  });

  it("preserves unspecified metadata instead of replacing it with product quantities", () => {
    const data = savedRemittanceData(document());
    const html = generateRemittanceMaskHTML({
      ...buildRemittanceMaskData(data.remittance),
      packageCount: null,
      declaredValue: null,
    });
    expect(html).toContain("BULTOS:</strong> </div>");
    expect(html).toContain("V.D.:</strong> </div>");
  });

  it("rejects void documents, malformed snapshots and documents over capacity", () => {
    const voided = document();
    voided.status = "VOIDED";
    expect(() => savedRemittanceData(voided)).toThrow("anulado");
    const malformed = document();
    malformed.header_snapshot = {};
    expect(() => savedRemittanceData(malformed)).toThrow();
    const overflow = document();
    overflow.lines = Array.from({ length: 27 }, () => ({
      ...overflow.lines[0],
    }));
    expect(() => savedRemittanceData(overflow)).toThrow("inválido");
  });
});
