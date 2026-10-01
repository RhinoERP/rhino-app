import { describe, expect, it } from "vitest";
import { getDocumentPath } from "./document-reference";

describe("getDocumentPath", () => {
  it("keeps canonical object paths", () => {
    expect(
      getDocumentPath("acme/payment-1/facturas_proveedor/factura.pdf")
    ).toBe("acme/payment-1/facturas_proveedor/factura.pdf");
  });

  it("extracts paths from historical public URLs", () => {
    expect(
      getDocumentPath(
        "https://project.supabase.co/storage/v1/object/public/documents/acme/sale-1/remittos/Remito.pdf?v=123"
      )
    ).toBe("acme/sale-1/remittos/Remito.pdf");
  });

  it("accepts signed document URLs", () => {
    expect(
      getDocumentPath(
        "https://project.supabase.co/storage/v1/object/sign/documents/acme/sale-1/remittos/Remito.pdf?token=secret"
      )
    ).toBe("acme/sale-1/remittos/Remito.pdf");
  });

  it("rejects other buckets and unsafe paths", () => {
    expect(
      getDocumentPath(
        "https://project.supabase.co/storage/v1/object/public/avatars/user.png"
      )
    ).toBeNull();
    expect(getDocumentPath("acme/../secret.pdf")).toBeNull();
  });
});
