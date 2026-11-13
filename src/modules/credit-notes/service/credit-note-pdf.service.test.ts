import { describe, expect, it } from "vitest";
import type { CreditNote } from "../types";
import {
  buildCreditNotePDFData,
  generateCreditNoteHTML,
} from "./credit-note-pdf.service";

function createCreditNote(overrides: Partial<CreditNote> = {}): CreditNote {
  return {
    id: "credit-note-1",
    organizationId: "org-1",
    salesOrderId: "sale-1",
    customerId: "customer-1",
    salesReturnId: "return-1",
    purchaseTargetCreditId: null,
    originType: "RETURN",
    reason: "DEVOLUCION",
    creditNoteNumber: "NC-00062",
    issueDate: "2026-06-30",
    amount: 397_260.98,
    applyToReceivable: false,
    appliedToReceivableAmount: 0,
    invoiceType: "FACTURA_A",
    observations: "Nota de credito por tybo inflado",
    status: "CONFIRMED",
    isHistorical: false,
    createdAt: "2026-06-30T12:00:00.000Z",
    arcaStatus: "authorized",
    arcaCae: "86261631505624",
    arcaCaeExpiresAt: "2026-07-09T00:00:00.000Z",
    arcaAuthorizedAt: "2026-06-30T12:00:00.000Z",
    arcaPointOfSale: 27,
    arcaVoucherNumber: 10_108,
    arcaVoucherTypeCode: 3,
    arcaLastError: null,
    arcaAssociatedVoucherTypeCode: 1,
    arcaAssociatedPointOfSale: 27,
    arcaAssociatedVoucherNumber: 27_862,
    arcaAssociatedVoucherDate: "2026-06-29",
    invoiceEmailStatus: "not_sent",
    invoiceEmailRecipient: null,
    invoiceEmailSentAt: null,
    invoiceEmailDeliveredAt: null,
    invoiceEmailLastAttemptAt: null,
    invoiceEmailLastEvent: null,
    invoiceEmailLastEventAt: null,
    invoiceEmailLastError: null,
    items: [
      {
        id: "credit-note-item-1",
        creditNoteId: "credit-note-1",
        salesOrderId: "sale-1",
        salesOrderItemId: "sale-item-1",
        salesReturnItemId: "return-item-1",
        productId: "product-1",
        productName: "TYBO CREMAC",
        productSku: "124",
        productUnitOfMeasure: "KG",
        weightQuantity: 49.1,
        discountPercent: 2.5,
        description: "TYBO CREMAC",
        quantity: 10,
        unitPrice: 6858.11,
        discountAmount: 0,
        netAmount: 328_314.86,
        taxAmount: 68_946.12,
        totalAmount: 397_260.98,
      },
    ],
    taxes: [
      {
        id: "tax-1",
        creditNoteId: "credit-note-1",
        taxId: "iva-21",
        name: "IVA",
        rate: 21,
        baseAmount: 328_314.86,
        taxAmount: 68_946.12,
        taxCodeSnapshot: "IVA_21",
      },
    ],
    sourceDocuments: [
      {
        id: "source-1",
        creditNoteId: "credit-note-1",
        salesOrderId: "sale-1",
        appliedAmount: 397_260.98,
        invoiceType: "FACTURA_A",
        invoiceNumber: "0027-00027862",
        arcaStatus: "authorized",
        arcaPointOfSale: 27,
        arcaVoucherNumber: 27_862,
        arcaVoucherTypeCode: 1,
        arcaVoucherDate: "2026-06-29",
      },
    ],
    customer: {
      id: "customer-1",
      businessName: "BENCHIMOL SARA DANIELA",
      fantasyName: null,
      email: "cliente@example.com",
      cuit: "27275180993",
      taxCondition: "RESPONSABLE_INSCRIPTO",
      address: "RUTA NAC. N. 38 - KM: 735",
      city: "ALTO VERDE (4153) - Tucuman",
      clientNumber: "09512",
      dueDays: 0,
    },
    sale: {
      saleNumber: 346,
      invoiceNumber: "0027-00027862",
      remittanceNumber: null,
      invoiceType: "FACTURA_A",
      totalAmount: 397_260.98,
      currency: "ARS",
      arcaStatus: "authorized",
      arcaPointOfSale: 27,
      arcaVoucherNumber: 27_862,
      arcaVoucherTypeCode: 1,
      arcaAuthorizedAt: "2026-06-29T12:00:00.000Z",
    },
    ...overrides,
  };
}

function renderHtml(creditNote: CreditNote): Promise<string> {
  const data = buildCreditNotePDFData({
    creditNote,
    issuerName: "CONECTANDO PUNTOS SRL",
    issuerCuit: "30717167984",
    returnItems: null,
    branding: {
      issuerBusinessName: "CONECTANDO PUNTOS SRL",
      issuerLegalAddress: "Ruta Nacional 9 km 478",
    },
  });

  return generateCreditNoteHTML(data);
}

describe("credit note PDF HTML", () => {
  it("does not infer zero VAT from the mere presence of lines", async () => {
    const base = createCreditNote();
    const html = await renderHtml(
      createCreditNote({
        fiscalBreakdown: null,
        taxes: [],
        items: base.items.map((item) => ({ ...item, taxAmount: 0 })),
      })
    );
    expect(html).toContain("Desglose fiscal no disponible");
    expect(html).not.toContain("<td>IVA</td>");
  });

  it("preserves known own line taxes when authorized details are unavailable", async () => {
    const html = await renderHtml(
      createCreditNote({ fiscalBreakdown: null, taxes: [] })
    );
    expect(html).not.toContain("Desglose fiscal no disponible");
    expect(html).toContain("68.946,12");
  });

  it("lists fiscal net, exempt and untaxed amounts without inventing a discount bridge", async () => {
    const html = await renderHtml(
      createCreditNote({
        amount: 248.5,
        items: [],
        taxes: [],
        fiscalBreakdown: {
          netAmount: 200,
          exemptAmount: 10,
          untaxedAmount: 5,
          totalAmount: 248.5,
          taxes: [
            { name: "IVA", rate: 21, baseAmount: 100, taxAmount: 21 },
            { name: "IVA", rate: 10.5, baseAmount: 100, taxAmount: 10.5 },
            { name: "Percepción", rate: 1, baseAmount: 200, taxAmount: 2 },
          ],
        },
      })
    );
    expect(html).toContain("<td>Neto gravado</td>");
    expect(html).toContain("<td>Exento</td>");
    expect(html).toContain("<td>No gravado</td>");
    expect(html).not.toContain("<td>Sub. Total 2</td>");
    expect(html).not.toContain("<td>Desc.</td>");
    expect(html).toContain("248,50");
  });

  it("uses USD in the PDF summary and keeps the fiscal total", async () => {
    const base = createCreditNote();
    const html = await renderHtml(
      createCreditNote({
        sale: base.sale ? { ...base.sale, currency: "USD" } : null,
        fiscalBreakdown: {
          netAmount: 328_314.86,
          exemptAmount: 0,
          untaxedAmount: 0,
          totalAmount: base.amount,
          taxes: [
            {
              name: "IVA",
              rate: 21,
              baseAmount: 328_314.86,
              taxAmount: 68_946.12,
            },
          ],
        },
      })
    );
    expect(html).toContain("Son dólares");
    expect(html).not.toContain("Son pesos");
    expect(html).toContain("397.260,98");
  });

  it("uses the authorized net and VAT for a note with no own lines or taxes", async () => {
    const note = createCreditNote({
      items: [],
      taxes: [],
      amount: 662_394.22,
      fiscalBreakdown: {
        netAmount: 547_433.24,
        exemptAmount: 0,
        untaxedAmount: 0,
        totalAmount: 662_394.22,
        taxes: [
          {
            name: "IVA",
            rate: 21,
            baseAmount: 547_433.24,
            taxAmount: 114_960.98,
          },
        ],
      },
    });
    const data = buildCreditNotePDFData({
      creditNote: note,
      issuerName: "Empresa",
    });
    expect(data.items[0]).toMatchObject({
      unitPrice: 547_433.24,
      netAmount: 547_433.24,
      taxAmount: 114_960.98,
      totalAmount: 662_394.22,
    });
    const html = await generateCreditNoteHTML(data);
    expect(html).toContain("IVA 21%");
    expect(html).toContain("114.960,98");
    expect(html).toContain("547.433,24");
  });

  it("marks unavailable fiscal data without reporting zero VAT", async () => {
    const html = await renderHtml(
      createCreditNote({ items: [], taxes: [], fiscalBreakdown: null })
    );
    expect(html).toContain("Desglose fiscal no disponible");
    expect(html).not.toContain("<td>IVA</td>");
  });

  it("renders return product details, taxes and fiscal QR", async () => {
    const html = await renderHtml(createCreditNote());

    expect(html).toContain("TYBO CREMAC");
    expect(html).toContain("124");
    expect(html).toContain("49,1");
    expect(html).toContain("IVA 21%");
    expect(html).toContain("CAE:");
    expect(html).toContain("data:image/png;base64");
  });

  it("renders manual or purchase-target notes without product metadata", async () => {
    const html = await renderHtml(
      createCreditNote({
        originType: "PURCHASE_TARGET",
        reason: "Bonificacion por objetivo de compra",
        items: [
          {
            id: "credit-note-item-2",
            creditNoteId: "credit-note-1",
            salesOrderId: "sale-1",
            salesOrderItemId: null,
            salesReturnItemId: null,
            productId: null,
            productName: null,
            productSku: null,
            productUnitOfMeasure: null,
            weightQuantity: null,
            discountPercent: null,
            description:
              "Bonificacion por objetivo de compra 2026-06-01 a 2026-06-30",
            quantity: 1,
            unitPrice: 10_000,
            discountAmount: 0,
            netAmount: 10_000,
            taxAmount: 0,
            totalAmount: 10_000,
          },
        ],
        taxes: [],
        amount: 10_000,
      })
    );

    expect(html).toContain("Bonificacion por objetivo de compra");
    expect(html).toContain('<td class="cell-code">-</td>');
  });

  it("renders pending fiscal state without QR", async () => {
    const html = await renderHtml(
      createCreditNote({
        arcaStatus: "not_requested",
        arcaCae: null,
        arcaCaeExpiresAt: null,
        arcaPointOfSale: null,
        arcaVoucherNumber: null,
        arcaVoucherTypeCode: null,
      })
    );

    expect(html).toContain("QR fiscal pendiente");
    expect(html).toContain("Documento no autorizado en ARCA");
    expect(html).not.toContain("data:image/png;base64");
  });

  it("paginates when the item list is longer than one page", async () => {
    const base = createCreditNote();
    const html = await renderHtml(
      createCreditNote({
        items: Array.from({ length: 20 }, (_, index) => ({
          ...base.items[0],
          id: `credit-note-item-${index + 1}`,
          description: `Producto ${index + 1}`,
          productName: `Producto ${index + 1}`,
          productSku: `SKU-${index + 1}`,
        })),
      })
    );

    expect(html).toContain("continuacion 2");
    expect(html).toContain("Pag. 2/2");
  });
});
