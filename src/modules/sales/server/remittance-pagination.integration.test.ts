import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateRemittanceHTML,
  type RemittanceData,
} from "../service/remittance-generator.service";
import { paginateFiscalRemittanceDocument } from "./remittance-pagination";

const chromePath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find(existsSync);

function fixture(long: boolean): RemittanceData {
  return {
    type: "REMITO_FINAL",
    documentNumber: "00009-00000042",
    date: "2026-11-23",
    issuer: { businessName: "Nombre comercial" },
    customer: {
      businessName: "Cliente",
      cuit: "20111111112",
      address: "Calle Ejemplo 456",
    },
    seller: { name: "Operador" },
    transport: {
      name: "Transporte",
      cuit: "20111111112",
      address: "Av. Transporte 789",
    },
    items: Array.from({ length: 26 }, (_, index) => ({
      sku: `SKU-${index}`,
      name: `Producto ${index} ${"Descripción extensa para comprobar la continuidad del remito. ".repeat(long ? 6 : 1)}`,
      quantity: 1,
      unitOfMeasure: "UN",
      unitPrice: 10,
      subtotal: 10,
    })),
    subtotal: 260,
    total: 260,
    taxesTotal: 0,
    discountTotal: 0,
    fiscal: {
      authorizationId: "60000000-0000-4000-8000-000000000001",
      cai: "12345678901234",
      expiresAt: "2026-12-31",
      pointOfSale: 9,
      number: 42,
      mode: "self_printed",
      firstNumber: 1,
      lastNumber: null,
      businessName: "Safe",
      cuit: "30710158230",
      address: "Calle Ejemplo 123",
      vatCondition: "IVA RESPONSABLE INSCRITO",
      grossIncome: "123",
      activityStart: "2020-01-01",
      printerName: "",
      printerCuit: "",
      printerRegistration: "",
      printedAt: "",
    },
  };
}

describe.skipIf(!chromePath)("fiscal remittance pagination in Chromium", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
    });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each([
    false,
    true,
  ])("keeps every product, fiscal header and signature within the page (long=%s)", async (long) => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 794, height: 1123 });
      await page.setContent(generateRemittanceHTML(fixture(long)));
      await page.evaluate(paginateFiscalRemittanceDocument);
      const result = await page.evaluate(() => {
        const copies = Array.from(
          document.querySelectorAll<HTMLElement>(".document-copy--fiscal")
        );
        return {
          pages: copies.length,
          rows: document.querySelectorAll("tbody tr").length,
          fits: copies.every(
            (copy) =>
              (copy.querySelector(".sig-wrap")?.getBoundingClientRect()
                .bottom ?? Number.POSITIVE_INFINITY) <=
              copy.getBoundingClientRect().bottom -
                Number.parseFloat(getComputedStyle(copy).paddingBottom) +
                0.5
          ),
          headers: copies.every(
            (copy) =>
              copy.textContent?.includes("12345678901234") &&
              copy.textContent.includes("00009-00000042")
          ),
          labels: copies.every((copy) =>
            copy.querySelector(".fiscal-copy")?.textContent?.includes("Página")
          ),
        };
      });
      expect(result.rows).toBe(52);
      expect(result.fits).toBe(true);
      expect(result.headers).toBe(true);
      expect(result.labels).toBe(true);
      if (long) {
        expect(result.pages).toBeGreaterThan(2);
      } else {
        expect(result.pages).toBe(2);
      }
      await page.evaluate(paginateFiscalRemittanceDocument);
      expect(
        await page.$$eval(".document-copy--fiscal", (copies) => copies.length)
      ).toBe(result.pages);
    } finally {
      await page.close();
    }
  });
});
