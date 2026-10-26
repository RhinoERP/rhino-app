import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { SalesOrderDetail } from "@/modules/sales/service/sales.service";

// @ts-expect-error Vitest accepts virtual mocks at runtime for this Next.js marker.
vi.mock("server-only", () => ({}), { virtual: true });

const mocks = vi.hoisted(() => ({
  getOrgSettings: vi.fn(),
  getManualFiscalInvoiceById: vi.fn(),
  getSalesOrderById: vi.fn(),
  getOrderQuotePaymentConditionBySaleId: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  getOrganizationArcaSettingsByOrganizationId: vi.fn(),
}));

vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesOrderById: mocks.getSalesOrderById,
}));
vi.mock("@/modules/organizations/service/org-settings.service", () => ({
  getOrgSettings: mocks.getOrgSettings,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));
vi.mock("@/modules/orders/service/orders.service", () => ({
  getOrderQuotePaymentConditionBySaleId:
    mocks.getOrderQuotePaymentConditionBySaleId,
}));
vi.mock("./repository", () => ({
  getOrganizationArcaSettingsByOrganizationId:
    mocks.getOrganizationArcaSettingsByOrganizationId,
}));
vi.mock("./manual-fiscal-invoices.service", () => ({
  getManualFiscalInvoiceById: mocks.getManualFiscalInvoiceById,
}));

import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import {
  generateAuthorizedSaleInvoicePdf,
  generateAuthorizedSaleInvoicePdfDocument,
} from "./fiscal-invoice-pdf.service";
import { renderHtmlToPdfDocument } from "./html-to-pdf.service";
import { generateAuthorizedManualFiscalInvoicePdfDocument } from "./manual-fiscal-invoice-pdf.service";

const chromePath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_EXECUTABLE_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find(existsSync);

function clothingSale(count = 7, detail = "") {
  const sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const name = "Chomba Polo Pique Manga Corta C/Cuello y Puño Tejido";
  return {
    id: "sale-1",
    arca_status: "authorized",
    arca_request_json: {
      wsfeRequest: {
        MonId: "PES",
        MonCotiz: 1,
        CbteFch: 20_260_925,
        DocTipo: 80,
        DocNro: 20_123_456_789,
      },
    },
    arca_point_of_sale: 2,
    arca_voucher_number: 12,
    arca_voucher_type_code: 1,
    arca_cae: "86394696509615",
    arca_cae_expires_at: "2026-10-05",
    arca_authorized_at: "2026-09-25T12:00:00Z",
    sale_date: "2026-09-25",
    sale_number: 12,
    invoice_number: "0002-00000012",
    invoice_type: "FACTURA_A",
    currency: "ARS",
    commercial_exchange_rate: null,
    total_amount: 673_286.77,
    sub_total: 556_435.35,
    global_discount_amount: 0,
    customer: { business_name: "Cliente", cuit: "20123456789" },
    observations:
      "2 CHOMBAS EN L VAN CON OTRO LOGO. UNA CON CIMALCO ENERGIA Y OTRA CON CIMALCO PREFABRICADOS. PEDIRLE LOGOS A GIULI",
    items: Array.from({ length: count }, (_, index) => ({
      id: String(index),
      sku: `CHO-${index + 1}`,
      name,
      description: `${name} - ${sizes[index % sizes.length]} / Gris Melange${detail}`,
      quantity: 1,
      weightQuantity: null,
      unitPrice: 14_462.81,
      discountPercent: 0,
      unitOfMeasure: "UN",
      extras: [{ description: "Bordado", price: 2858 }],
    })),
    taxes: [{ name: "IVA21", rate: 21, taxAmount: 116_851.42 }],
  } as unknown as SalesOrderDetail;
}

// Layout regressions need a real Chromium, available locally or via the configured path in CI.
describe.skipIf(!chromePath)("fiscal invoice pagination in Chromium", () => {
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrgSettings.mockResolvedValue({ invoice_print_duplicate: false });
    mocks.getOrganizationBySlug.mockResolvedValue({
      id: "org-1",
      name: "Test",
      cuit: "30123456789",
    });
    mocks.getOrganizationArcaSettingsByOrganizationId.mockResolvedValue(null);
    mocks.getOrderQuotePaymentConditionBySaleId.mockResolvedValue(null);
  });

  async function inspect(html: string) {
    const page = await browser.newPage();
    try {
      await page.setContent(html);
      return await page.evaluate(() => {
        const copies = Array.from(
          document.querySelectorAll<HTMLElement>(".document-copy")
        );
        return copies.map((copy) => {
          const sheet = copy.querySelector<HTMLElement>(".sheet");
          if (!sheet) {
            throw new Error("Missing sheet");
          }
          const style = getComputedStyle(sheet);
          const bottom =
            sheet.getBoundingClientRect().bottom -
            Number.parseFloat(style.paddingBottom) -
            Number.parseFloat(style.borderBottomWidth);
          return {
            group: copy.dataset.paginationGroup,
            copyLabel: copy
              .querySelector(".invoice-copy-label")
              ?.textContent?.trim(),
            skus: Array.from(copy.querySelectorAll(".cell-code")).map((cell) =>
              cell.textContent?.trim()
            ),
            details: Array.from(copy.querySelectorAll(".item-secondary")).map(
              (cell) => cell.textContent?.trim()
            ),
            names: Array.from(copy.querySelectorAll(".item-name")).map((cell) =>
              cell.textContent?.trim()
            ),
            labels: Array.from(
              copy.querySelectorAll(".footer-page, .continuation-page")
            ).map((cell) => cell.textContent?.trim()),
            summary: copy.querySelectorAll(".summary-layout").length,
            qr: copy.querySelectorAll(".footer-qr img").length,
            clipped: Array.from(sheet.children)
              .filter((child) => !child.classList.contains("watermark"))
              .some(
                (child) => child.getBoundingClientRect().bottom > bottom + 0.5
              ),
          };
        });
      });
    } finally {
      await page.close();
    }
  }

  it("prints XS through 3XL completely, preserving stored descriptions", async () => {
    mocks.getSalesOrderById.mockResolvedValue(clothingSale());
    const document = await generateAuthorizedSaleInvoicePdfDocument({
      orgSlug: "test",
      saleId: "sale-1",
    });
    const pages = await inspect(document.html);
    expect(pages.flatMap((page) => page.skus)).toEqual(
      Array.from({ length: 7 }, (_, index) => `CHO-${index + 1}`)
    );
    expect(pages.flatMap((page) => page.details)).toEqual(
      ["XS", "S", "M", "L", "XL", "2XL", "3XL"].map(
        (size) =>
          `Chomba Polo Pique Manga Corta C/Cuello y Puño Tejido - ${size} / Gris Melange`
      )
    );
    expect(pages.every((page) => !page.clipped)).toBe(true);
    expect(pages.reduce((sum, page) => sum + page.summary, 0)).toBe(1);
    expect(pages.at(-1)?.qr).toBe(1);
    expect(document.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages.every((page) => page.copyLabel === "ORIGINAL")).toBe(true);
  }, 30_000);

  it("uses each company's preference and includes complete original and duplicate sets", async () => {
    mocks.getOrgSettings.mockImplementation(async (slug: string) => ({
      invoice_print_duplicate: slug === "two-copies",
    }));
    mocks.getSalesOrderById.mockResolvedValue(
      clothingSale(12, " - Bordado especial frente y espalda".repeat(3))
    );
    const result = await generateAuthorizedSaleInvoicePdfDocument({
      orgSlug: "two-copies",
      saleId: "sale-1",
    });
    const pages = await inspect(result.html);
    const original = pages.filter((page) => page.copyLabel === "ORIGINAL");
    const duplicate = pages.filter((page) => page.copyLabel === "DUPLICADO");
    expect(original.length).toBeGreaterThan(1);
    expect(duplicate.length).toBe(original.length);
    expect(pages.map((page) => page.copyLabel)).toEqual([
      ...original.map(() => "ORIGINAL"),
      ...duplicate.map(() => "DUPLICADO"),
    ]);
    for (const copy of [original, duplicate]) {
      expect(copy.flatMap((page) => page.skus)).toEqual(
        Array.from({ length: 12 }, (_, index) => `CHO-${index + 1}`)
      );
      expect(copy.every((page) => !page.clipped)).toBe(true);
      expect(copy.at(-1)?.qr).toBe(1);
      expect(copy.at(-1)?.summary).toBe(1);
      for (const [index, page] of copy.entries()) {
        expect(
          page.labels.every(
            (label) => label === `Pág. ${index + 1}/${copy.length}`
          )
        ).toBe(true);
      }
    }
    const reprinted = await renderHtmlToPdfDocument(result.html);
    expect((await inspect(reprinted.html)).length).toBe(pages.length);

    const single = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "one-copy",
      saleId: "sale-1",
    });
    const singlePages = await inspect(single.html);
    expect(singlePages.length).toBe(original.length);
    expect(singlePages.every((page) => page.copyLabel === "ORIGINAL")).toBe(
      true
    );
  }, 30_000);

  it("includes commercial annexes in both complete copies", async () => {
    mocks.getOrgSettings.mockResolvedValue({ invoice_print_duplicate: true });
    const advance = clothingSale(1);
    advance.document_type = "ADVANCE";
    advance.parent_sales_order_id = "parent-1";
    mocks.getSalesOrderById
      .mockResolvedValueOnce(advance)
      .mockResolvedValueOnce(clothingSale(30));
    const result = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    const pages = await inspect(result.html);
    for (const label of ["ORIGINAL", "DUPLICADO"]) {
      const annex = pages.filter(
        (page) => page.group === "commercial" && page.copyLabel === label
      );
      expect(annex.flatMap((page) => page.skus)).toEqual(
        Array.from({ length: 30 }, (_, index) => `CHO-${index + 1}`)
      );
      expect(annex.every((page) => !page.clipped)).toBe(true);
    }
  }, 30_000);

  it("applies the same company preference to manual fiscal invoices", async () => {
    mocks.getOrgSettings.mockResolvedValue({ invoice_print_duplicate: true });
    const sale = clothingSale(2);
    mocks.getManualFiscalInvoiceById.mockResolvedValue({
      ...sale,
      status: "authorized",
      issue_date: sale.sale_date,
      total_tax_amount: 116_851.42,
      exchange_rate: 1,
      items: sale.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        iva_rate: 21,
        total_amount: 17_320.81,
      })),
    });
    const result = await generateAuthorizedManualFiscalInvoicePdfDocument({
      orgSlug: "test",
      invoiceId: "manual-1",
    });
    const page = await browser.newPage();
    try {
      await page.setContent(result.html);
      const copies = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-invoice-document]")).map(
          (copy) => ({
            label: copy.querySelector(".invoice-copy-label")?.textContent,
            rows: copy.querySelectorAll("table:not(.totals) tbody tr").length,
            qr: copy.querySelectorAll(".qr img").length,
          })
        )
      );
      expect(copies).toEqual([
        { label: "ORIGINAL", rows: 2, qr: 1 },
        { label: "DUPLICADO", rows: 2, qr: 1 },
      ]);
    } finally {
      await page.close();
    }
  }, 30_000);

  it("continues long descriptions across pages, preserving order and final totals", async () => {
    mocks.getSalesOrderById.mockResolvedValue(
      clothingSale(
        35,
        " - Bordado frente y espalda según diseño aprobado".repeat(4)
      )
    );
    const result = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    const pages = await inspect(result.html);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flatMap((page) => page.skus)).toEqual(
      Array.from({ length: 35 }, (_, index) => `CHO-${index + 1}`)
    );
    expect(pages.every((page) => !page.clipped)).toBe(true);
    for (const [index, page] of pages.entries()) {
      expect(
        page.labels.every(
          (label) => label === `Pág. ${index + 1}/${pages.length}`
        )
      ).toBe(true);
      expect(page.summary).toBe(index === pages.length - 1 ? 1 : 0);
      expect(page.qr).toBe(index === pages.length - 1 ? 1 : 0);
    }
  }, 30_000);

  it("preserves all custom descriptions and escapes their HTML", async () => {
    const sale = clothingSale(3);
    sale.items[0].description = sale.items[0].name;
    sale.items[1].description = "Bordado <cliente> & ajuste de mangas";
    sale.items[2].description = "Chomba Polo alternativa - 2XL / Negro";
    mocks.getSalesOrderById.mockResolvedValue(sale);
    const result = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    const pages = await inspect(result.html);
    expect(pages.flatMap((page) => page.details)).toEqual([
      sale.items[0].name,
      "Bordado <cliente> & ajuste de mangas",
      "Chomba Polo alternativa - 2XL / Negro",
    ]);
    expect(result.html).toContain("&lt;cliente&gt; &amp;");
  }, 30_000);

  it("moves large observations to a final page without clipping the product", async () => {
    const sale = clothingSale(
      1,
      " - Bordado frente y espalda según diseño aprobado".repeat(24)
    );
    sale.observations =
      "Indicaciones de confección, entrega y aprobación de las muestras. ".repeat(
        22
      );
    mocks.getSalesOrderById.mockResolvedValue(sale);
    const result = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    const pages = await inspect(result.html);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => page.skus)).toEqual(["CHO-1"]);
    expect(pages.every((page) => !page.clipped)).toBe(true);
    expect(pages.at(-1)?.summary).toBe(1);
    expect(pages.at(-1)?.qr).toBe(1);
    expect(result.html).toContain(sale.observations.trim());
  }, 30_000);

  it("paginates the advance's commercial annex without losing variant rows", async () => {
    const advance = clothingSale(1);
    advance.document_type = "ADVANCE";
    advance.parent_sales_order_id = "parent-1";
    mocks.getSalesOrderById
      .mockResolvedValueOnce(advance)
      .mockResolvedValueOnce(
        clothingSale(32, " - Bordado especial en frente y espalda".repeat(3))
      );
    const result = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    const pages = await inspect(result.html);
    const annex = pages.filter((page) => page.group === "commercial");
    expect(annex.length).toBeGreaterThan(1);
    expect(annex.flatMap((page) => page.skus)).toEqual(
      Array.from({ length: 32 }, (_, index) => `CHO-${index + 1}`)
    );
    expect(pages.every((page) => !page.clipped)).toBe(true);
    for (const [index, page] of annex.entries()) {
      expect(page.labels).toEqual([`Anexo ${index + 1}/${annex.length}`]);
    }
  }, 30_000);
});
