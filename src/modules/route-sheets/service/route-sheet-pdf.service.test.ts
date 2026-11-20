import { describe, expect, it } from "vitest";
import { generateRouteSheetHTML } from "./route-sheet-pdf.service";

describe("route sheet delivery destination", () => {
  it("prints the selected sale snapshot, escaped and independent of customer master data", () => {
    const html = generateRouteSheetHTML({
      issuer: { businessName: "Organización" },
      carrierName: "Transporte",
      scheduledDate: "2026-11-18",
      statusLabel: "Pendiente",
      rows: [
        {
          date: "2026-11-18",
          document: "R1",
          customer: "Cliente",
          siteName: "Depósito norte",
          address: "Calle <Nueva> 120",
          city: "Rosario",
          amount: 100,
          bultos: null,
          unidades: null,
          kilograms: null,
        },
      ],
      total: 100,
    });
    expect(html).toContain("Depósito norte");
    expect(html).toContain("Calle &lt;Nueva&gt; 120");
    expect(html).not.toContain("Calle <Nueva> 120");
  });
});
