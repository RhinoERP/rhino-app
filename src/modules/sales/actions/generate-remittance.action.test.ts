import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  ensure: vi.fn(),
  generateRemittancePdfDocument: vi.fn(),
  uploadSalesDocument: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("../server/documents-storage.service", () => ({
  uploadSalesDocument: mocks.uploadSalesDocument,
}));
vi.mock("../server/remittance-pdf-document.service", () => ({
  generateRemittancePdfDocument: mocks.generateRemittancePdfDocument,
}));

import { generateRemittanceAction } from "./generate-remittance.action";

describe("generateRemittanceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateRemittancePdfDocument.mockResolvedValue({
      filename: "Remito_1050.pdf",
      content: Buffer.from("PDF"),
      html: "<html></html>",
      saleNumber: 1050,
    });
  });

  it("returns a downloadable PDF and the Storage error when upload fails", async () => {
    mocks.uploadSalesDocument.mockResolvedValue({
      success: false,
      error: "Permiso denegado",
    });

    const result = await generateRemittanceAction(
      "nilda-market",
      "sale-1050",
      "REMITO_FINAL"
    );

    expect(result).toMatchObject({
      success: true,
      pdfUrl: null,
      storageError: "Permiso denegado",
      fallbackPdf: {
        filename: "Remito_1050.pdf",
        pdfBase64: Buffer.from("PDF").toString("base64"),
      },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the PDF if Storage succeeds but the URL cannot be saved", async () => {
    mocks.uploadSalesDocument.mockResolvedValue({
      success: true,
      url: "nilda-market/sale-1050/remittos/Remito_1050.pdf",
    });
    mocks.createClient.mockResolvedValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });

    const result = await generateRemittanceAction(
      "nilda-market",
      "sale-1050",
      "REMITO_FINAL"
    );

    expect(result.success).toBe(true);
    expect(result.pdfUrl).toBeNull();
    expect(result.storageError).toContain("venta no actualizada");
    expect(result.fallbackPdf?.filename).toBe("Remito_1050.pdf");
  });
});
