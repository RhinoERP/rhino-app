import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  })),
}));
vi.mock("../service/supplier-invoices.service", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../service/supplier-invoices.service")
  >()),
  createSupplierInvoice: mocks.create,
}));

import { SupplierInvoiceRegistrationError } from "../service/supplier-invoices.service";
import { createSupplierInvoiceAction } from "./create-supplier-invoice.action";

const invoiceId = "00000000-0000-4000-8000-000000000001";
const orderA = "00000000-0000-4000-8000-000000000010";
const orderB = "00000000-0000-4000-8000-000000000011";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    orgSlug: "demo",
    supplierId: "00000000-0000-4000-8000-000000000020",
    invoiceType: "A",
    invoiceNumber: "42",
    invoiceDate: "2026-11-04",
    subtotalAmount: "100",
    taxAmount: "0",
    totalAmount: "100",
    currency: "ARS",
  })) {
    data.set(key, value);
  }
  data.append("purchaseOrderIds", orderA);
  data.append("purchaseOrderIds", orderB);
  data.set(
    "file",
    new File(["%PDF fixture"], "factura.pdf", { type: "application/pdf" })
  );
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ id: invoiceId });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
});
describe("invoice attachment transaction boundary", () => {
  it("rejects an oversized file without uploading or creating debt", async () => {
    const data = form();
    data.set(
      "file",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
        type: "application/pdf",
      })
    );
    expect(await createSupplierInvoiceAction(data)).toEqual({
      success: false,
      error: expect.stringContaining("10 MiB"),
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("passes all OC IDs and revalidates each without multiplying registrations", async () => {
    const result = await createSupplierInvoiceAction(form());
    expect(result.success).toBe(true);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseOrderIds: [orderA, orderB],
        currency: "ARS",
      }),
      expect.objectContaining({
        filename: "factura.pdf",
        path: expect.stringContaining("/facturas_proveedor/factura.pdf"),
      })
    );
    expect(mocks.revalidate).toHaveBeenCalledWith(
      `/org/demo/compras/${orderA}`
    );
    expect(mocks.revalidate).toHaveBeenCalledWith(
      `/org/demo/compras/${orderB}`
    );
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0]
    );
  });
  it("does not create debt when storage upload fails", async () => {
    mocks.upload.mockResolvedValue({
      error: { message: "storage unavailable" },
    });
    const result = await createSupplierInvoiceAction(form());
    expect(result.success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("cleans staged storage when the atomic registration is rejected", async () => {
    mocks.create.mockRejectedValue(
      new SupplierInvoiceRegistrationError("currency conflict", true)
    );
    const result = await createSupplierInvoiceAction(form());
    expect(result.success).toBe(false);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0]
    );
  });
  it("preserves the committed invoice and file if a later UI refresh fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      // This test intentionally exercises and suppresses the cache failure log.
    });
    mocks.revalidate.mockImplementationOnce(() => {
      throw new Error("refresh failed");
    });
    const result = await createSupplierInvoiceAction(form());
    expect(result).toEqual({ success: true, invoice: { id: invoiceId } });
    expect(mocks.remove).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("preserves a potentially committed attachment after an ambiguous network failure", async () => {
    mocks.create.mockRejectedValue(
      new SupplierInvoiceRegistrationError("network response lost", false)
    );
    const result = await createSupplierInvoiceAction(form());
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("antes de reintentar"),
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
