import { describe, expect, it } from "vitest";
import type { RemittanceData } from "./remittance-generator.service";
import {
  buildRemittanceFromSale,
  generateRemittanceHTML,
  REMITTANCE_FINAL_VISIBILITY_DEFAULTS,
} from "./remittance-generator.service";

const HIDDEN_MONEY_VALUES_REGEX = /9876[,.]?54|19753[,.]?08|17777[,.]?77/;

function saleWithArcaStatus(arcaStatus: string, invoiceNumber: string | null) {
  return {
    arca_status: arcaStatus,
    invoice_number: invoiceNumber,
    remittance_number: "R-0001",
    sale_number: 1,
    sale_date: "2026-08-12",
    expiration_date: null,
    customer: {
      business_name: "Cliente",
      fantasy_name: null,
      cuit: null,
      phone: null,
      address: null,
      city: null,
      delivery_address: null,
      delivery_city: null,
      tax_condition: null,
    },
    seller: null,
    items: [],
    taxes: [],
    global_discount_amount: 0,
    observations: null,
  } as unknown as Parameters<typeof buildRemittanceFromSale>[0];
}

describe("remittance invoice reference", () => {
  it("shows the ARCA invoice number on an authorized sale remittance", () => {
    const data = buildRemittanceFromSale(
      saleWithArcaStatus("authorized", "0001-00000042"),
      "REMITO_FINAL"
    );

    expect(data.invoiceNumber).toBe("0001-00000042");
    expect(generateRemittanceHTML(data)).toContain(
      "Factura:</span> 0001-00000042"
    );
  });

  it.each([
    "not_requested",
    "pending",
    "error",
  ])("hides an invoice number unless ARCA is authorized (%s)", (arcaStatus) => {
    const data = buildRemittanceFromSale(
      saleWithArcaStatus(arcaStatus, "MANUAL-42"),
      "REMITO_FINAL"
    );

    expect(data.invoiceNumber).toBeUndefined();
    expect(generateRemittanceHTML(data)).not.toContain("Factura:</span>");
  });
});

function remittanceWithItems(type: RemittanceData["type"]): RemittanceData {
  return {
    type,
    documentNumber: "R-0001",
    saleNumber: 1,
    date: "2026-08-12",
    issuer: {
      businessName: "Empresa de prueba",
      cuit: "30-12345678-9",
      legalAddress: "Calle 123",
    },
    customer: {
      businessName: "Cliente de prueba",
    },
    seller: { name: "Vendedor" },
    items: [
      {
        sku: "SKU-001",
        name: "Producto de prueba",
        quantity: 2,
        unitOfMeasure: "unid",
        weightQuantity: 4.5,
        unitPrice: 9876.54,
        subtotal: 19_753.08,
        discountPercentage: 10,
      },
    ],
    subtotal: 19_753.08,
    taxesTotal: 0,
    discountTotal: 1975.31,
    total: 17_777.77,
  };
}

describe("remittance commercial information", () => {
  it("hides product prices, discounts, and totals on final remittances", () => {
    const html = generateRemittanceHTML(remittanceWithItems("REMITO_FINAL"));
    const documentContent = html.slice(html.indexOf("</style>"));

    expect(html).toContain("<title>REMITO DE VENTA R-0001</title>");
    expect(documentContent).toContain(
      '<th style="width:78px;text-align:center">Cant.</th>'
    );
    expect(documentContent).toContain("<th>Descripción</th>");
    expect(documentContent).toContain(
      'class="document-copy document-copy--remittance document-copy--remittance-expanded"'
    );
    expect(documentContent).toContain(
      '2 <span class="unit-inline">unid</span>'
    );
    expect(documentContent).not.toContain("SKU-001");
    expect(documentContent).not.toContain("Peso</th>");
    expect(documentContent).not.toContain("Precio U.");
    expect(documentContent).not.toContain("Desc.");
    expect(documentContent).not.toContain("Importe");
    expect(documentContent).not.toContain('class="total-row"');
    expect(documentContent).not.toContain("DIECISIETE MIL");
    expect(documentContent).not.toMatch(HIDDEN_MONEY_VALUES_REGEX);
  });

  it.each([
    ["showSku", "SKU-001"],
    ["showWeight", "4.50"],
    ["showUnitPrice", "Precio U."],
    ["showDiscount", "Desc."],
    ["showLineTotal", "Importe"],
    ["showTotal", "DIECISIETE MIL"],
  ] as const)("shows %s only when it is enabled", (setting, expected) => {
    const data = remittanceWithItems("REMITO_FINAL");
    data.finalRemittanceVisibility = {
      ...REMITTANCE_FINAL_VISIBILITY_DEFAULTS,
      [setting]: true,
    };

    expect(generateRemittanceHTML(data)).toContain(expected);
  });

  it("shows all opted-in commercial fields on final remittances", () => {
    const data = remittanceWithItems("REMITO_FINAL");
    data.finalRemittanceVisibility = {
      showSku: true,
      showWeight: true,
      showUnitPrice: true,
      showDiscount: true,
      showLineTotal: true,
      showTotal: true,
    };
    const html = generateRemittanceHTML(data);
    const documentContent = html.slice(html.indexOf("</style>"));

    expect(documentContent).toContain("SKU-001");
    expect(documentContent).toContain("Peso</th>");
    expect(documentContent).toContain("Precio U.");
    expect(documentContent).toContain("Desc.");
    expect(documentContent).toContain("Importe");
    expect(documentContent).toContain('class="total-row"');
    expect(documentContent).toContain("DIECISIETE MIL");
  });

  it("keeps prices and totals on budgets", () => {
    const html = generateRemittanceHTML(remittanceWithItems("PRESUPUESTO"));
    const documentContent = html.slice(html.indexOf("</style>"));

    expect(documentContent).toContain("Precio U.");
    expect(documentContent).toContain("Desc.");
    expect(documentContent).toContain("Importe");
    expect(documentContent).toContain('class="total-row"');
    expect(documentContent).toContain("SKU-001");
    expect(documentContent).toContain('class="document-copy"');
    expect(documentContent).not.toContain(
      'class="document-copy document-copy--remittance-expanded"'
    );
  });
});

describe("remittance product variants", () => {
  it("shows the variant as secondary text next to the product name", () => {
    const data = remittanceWithItems("REMITO_FINAL");
    data.items[0].variantName = "M · Azul";

    const html = generateRemittanceHTML(data);

    expect(html).toContain(`<span class="variant">M · Azul</span>`);
  });

  it("omits the variant span when there is no variant", () => {
    const data = remittanceWithItems("PRESUPUESTO");
    data.items[0].variantName = undefined;

    expect(generateRemittanceHTML(data)).not.toContain('class="variant"');
  });
});
