import { beforeEach, describe, expect, it, vi } from "vitest";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  saved: vi.fn(),
  persist: vi.fn(),
  resolve: vi.fn(),
  render: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}));
vi.mock("@/modules/sales/server/documents-storage.service", () => ({
  uploadOrderDocument: vi.fn(async () => ({
    success: true,
    url: "org/document/order_remittos/remito.pdf",
  })),
}));
vi.mock("../server/order-remittance-documents.service", () => ({
  findSavedRemittance: mocks.saved,
  persistSavedRemittancePdf: mocks.persist,
}));
vi.mock("../server/order-remittance-pdf-document.service", () => ({
  resolveRemittanceOrderIds: mocks.resolve,
  generateOrderRemittancePdfDocument: mocks.render,
}));

import { downloadOrderRemittanceAction } from "./download-order-remittance.action";

describe("documentary PDF download permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockReset();
    mocks.resolve.mockResolvedValue(["child"]);
    mocks.render.mockResolvedValue({
      documentId: "document",
      filename: "remito.pdf",
      content: Buffer.from("pdf"),
    });
  });

  it("allows a readable issued document without requiring orders.manage", async () => {
    mocks.saved.mockResolvedValue({ id: "document" });
    const result = await downloadOrderRemittanceAction("org", "child", "46");
    expect(result.success).toBe(true);
    expect(mocks.ensure).toHaveBeenCalledExactlyOnceWith(
      READ_PERMISSIONS.orders,
      "org"
    );
    expect(mocks.persist).toHaveBeenCalledWith(
      "org",
      "document",
      "org/document/order_remittos/remito.pdf"
    );
  });

  it("keeps the legacy manage requirement when no readable saved document exists", async () => {
    mocks.saved.mockResolvedValue(null);
    mocks.ensure.mockImplementation((permission) => {
      if (permission === "orders.manage") {
        throw new Error("Forbidden");
      }
    });
    await expect(
      downloadOrderRemittanceAction("org", "child", "46")
    ).rejects.toThrow("Forbidden");
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
