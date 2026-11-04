import { describe, expect, it } from "vitest";
import {
  CreateIssuedCheckSchema,
  CreateReceivedCheckSchema,
} from "../tesoreria.schema";

const ID = "6f1c1a5e-7b0e-4d0e-9d1a-0c5b8a1f2e3d";

describe("check date rules", () => {
  it("rejects received checks that expire before issue", () => {
    const result = CreateReceivedCheckSchema.safeParse({
      orgId: ID,
      numeroCheque: "1",
      bancoEmisor: "Banco",
      importe: "100",
      fechaEmision: "2026-10-19",
      fechaVencimiento: "2026-10-18",
    });

    expect(result.success).toBe(false);
  });

  it("accepts deferred received checks", () => {
    const result = CreateReceivedCheckSchema.safeParse({
      orgId: ID,
      numeroCheque: "1",
      bancoEmisor: "Banco",
      importe: "100",
      fechaEmision: "2026-10-19",
      fechaVencimiento: "2026-11-19",
    });

    expect(result.success).toBe(true);
  });

  it("rejects issued checks debited before issue", () => {
    const result = CreateIssuedCheckSchema.safeParse({
      orgId: ID,
      cuentaBancariaId: ID,
      numeroCheque: "1",
      importe: "100",
      fechaEmision: "2026-10-19",
      fechaDebito: "2026-10-01",
      beneficiario: "Proveedor",
    });

    expect(result.success).toBe(false);
  });
});
