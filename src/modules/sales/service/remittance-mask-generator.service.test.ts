import { describe, expect, it } from "vitest";
import type { RemittanceData } from "./remittance-generator.service";
import {
  buildRemittanceMaskData,
  generateRemittanceMaskHTML,
  REMITTANCE_MASK_ITEMS_PER_PAGE,
} from "./remittance-mask-generator.service";

function remittanceWithItems(itemCount = 1): RemittanceData {
  return {
    type: "REMITO_FINAL",
    documentNumber: "NPV-000005858",
    date: "2026-08-05",
    issuer: { businessName: "Empresa" },
    customer: {
      businessName: "CALF COOPERATIVA PROVINCIAL",
      address: "MITRE 609, NEUQUEN",
      cuit: "30-54572139-9",
      taxCondition: "RESPONSABLE INSCRIPTO",
    },
    seller: { name: "Vendedor" },
    items: Array.from({ length: itemCount }, (_, index) => ({
      sku: `SKU-${index}`,
      name: `Producto ${index + 1}`,
      brand: index === 0 ? "Marca" : null,
      quantity: index + 1,
      unitOfMeasure: "unid",
      unitPrice: 100,
      subtotal: 100,
    })),
    subtotal: itemCount * 100,
    taxesTotal: 0,
    discountTotal: 0,
    total: itemCount * 100,
  };
}

describe("remittance mask data", () => {
  it("maps available remittance fields and leaves unavailable fields out", () => {
    const data = buildRemittanceMaskData(remittanceWithItems(), {
      carrierName: "Diermar",
    });

    expect(data).toMatchObject({
      documentNumber: "NPV-000005858",
      date: "2026-08-05",
      carrierName: "Diermar",
      packageCount: 1,
      declaredValue: 70,
      customer: {
        businessName: "CALF COOPERATIVA PROVINCIAL",
        cuit: "30-54572139-9",
      },
    });
    expect(data.items[0]).toEqual({
      quantity: 1,
      description: "Producto 1 Marca",
    });
  });

  it("renders optional purchase order data safely and prints the added fields", () => {
    const remittance = remittanceWithItems();
    remittance.customer.address = undefined;
    remittance.customer.cuit = undefined;
    remittance.customer.taxCondition = undefined;

    const html = generateRemittanceMaskHTML(
      buildRemittanceMaskData(remittance, {
        purchaseOrderNumber: "OC <123>",
      })
    );

    expect(html).toContain('class="field carrier-name"></div>');
    expect(html).toContain('class="field customer-cuit"></div>');
    expect(html).toContain("BULTOS:</strong> 1");
    expect(html).toContain("O.C.:</strong> OC &lt;123&gt;");
    expect(html).toContain("V.D.:</strong> 70,00");
  });

  it("leaves the optional purchase order blank", () => {
    const html = generateRemittanceMaskHTML(
      buildRemittanceMaskData(remittanceWithItems())
    );

    expect(html).toContain(
      'class="field purchase-order"><strong>O.C.:</strong> </div>'
    );
  });

  it("sums all item quantities as packages and truncates the declared value", () => {
    const remittance = remittanceWithItems(2);
    remittance.items[0].quantity = 1.25;
    remittance.items[1].quantity = 2.5;
    remittance.total = 100.019;

    const data = buildRemittanceMaskData(remittance);

    expect(data.packageCount).toBe(3.75);
    expect(data.declaredValue).toBe(70.01);
  });
});

describe("remittance mask pagination", () => {
  it("continues long remittances on consecutive pages with the same document number", () => {
    const itemCount = REMITTANCE_MASK_ITEMS_PER_PAGE + 1;
    const html = generateRemittanceMaskHTML(
      buildRemittanceMaskData(remittanceWithItems(itemCount))
    );

    expect(html.match(/class="mask-page"/g)).toHaveLength(2);
    expect(html.match(/NPV-000005858/g)).toHaveLength(3);
    expect(html.match(/class="field package-count"/g)).toHaveLength(2);
    expect(html.match(/class="field purchase-order"/g)).toHaveLength(2);
    expect(html.match(/class="field declared-value"/g)).toHaveLength(2);
    expect(html).toContain("Hoja 1 de 2");
    expect(html).toContain("Hoja 2 de 2");
    expect(html).toContain(`Producto ${itemCount}`);
  });
});
