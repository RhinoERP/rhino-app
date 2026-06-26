import { describe, expect, it } from "vitest";
import type { TicketCompanyData, TicketSaleData } from "../types";
import { generateReceiptBuffer } from "./generate-receipt-buffer";

const company: TicketCompanyData = {
  name: "Nilda Market",
  cuit: "30-00000000-7",
  address: "Mendoza 1678",
  vatCondition: "Responsable inscripto",
  grossIncomeNumber: "901-123456-7",
  activityStartDate: "2020-01-01",
};

const baseSale: TicketSaleData = {
  saleNumber: "POS-0001",
  saleDate: "2026-06-09T15:00:00.000Z",
  receiver: {
    name: "Consumidor final",
    documentLabel: "Consumidor final",
    vatCondition: "Consumidor final",
  },
  items: [
    {
      quantity: 1,
      product: "Producto fiscal",
      unitPrice: 1000,
      subtotal: 1000,
    },
  ],
  subtotal: 1000,
  taxes: [{ name: "IVA", rate: 21, amount: 210, baseAmount: 1000 }],
  taxAmount: 210,
  total: 1210,
};

function decode(buffer: Uint8Array): string {
  return new TextDecoder().decode(buffer);
}

describe("generateReceiptBuffer", () => {
  it("incluye datos fiscales, CAE y QR en tickets autorizados", () => {
    const output = decode(
      generateReceiptBuffer({
        company,
        sale: {
          ...baseSale,
          fiscal: {
            invoiceType: "FACTURA_B",
            letter: "B",
            voucherTypeCode: 6,
            pointOfSale: 1,
            voucherNumber: 123,
            invoiceNumber: "0001-00000123",
            cae: "70417054367476",
            caeExpirationDate: "2026-06-19",
            qrUrl: "https://www.arca.gob.ar/fe/qr/?p=test",
          },
        },
      })
    );

    expect(output).toContain("TICKET FACTURA B");
    expect(output).toContain("Cod. 006");
    expect(output).toContain("REG. FISCAL (LEY 27.743)");
    expect(output).toContain("IVA CONTENIDO:");
    expect(output).toContain("$ 1.210,00");
    expect(output).not.toContain("IVA (21%)");
    expect(output).toContain("CAE: 70417054367476");
    expect(output).toContain("QR fiscal ARCA");
  });

  it("marca los tickets internos como no válidos como factura", () => {
    const output = decode(
      generateReceiptBuffer({
        company,
        sale: baseSale,
      })
    );

    expect(output).toContain("TICKET INTERNO");
    expect(output).toContain("NO VALIDO COMO FACTURA");
    expect(output).not.toContain("CAE:");
  });

  it("no repite consumidor final ni imprime direcciones placeholder en tickets internos", () => {
    const output = decode(
      generateReceiptBuffer({
        company: {
          ...company,
          address: "Dirección no informada",
        },
        sale: baseSale,
      })
    );

    expect(output.match(/Consumidor final/g)).toHaveLength(1);
    expect(output).not.toContain("Direccion no informada");
    expect(output).not.toContain("IVA: Consumidor final");
  });
});
