import { describe, expect, it } from "vitest";
import {
  hashTreasuryPayload,
  normalizeTreasuryPayload,
} from "../treasury-idempotency-payload";

describe("treasury idempotency payloads", () => {
  it("normalizes object keys deterministically", () => {
    const normalized = normalizeTreasuryPayload({
      zeta: "last",
      alpha: "first",
      nested: {
        beta: 2,
        alpha: 1,
      },
    });

    expect(Object.keys(normalized)).toEqual(["alpha", "nested", "zeta"]);
    expect(Object.keys(normalized.nested)).toEqual(["alpha", "beta"]);
  });

  it("produces the same hash for semantically identical payloads", () => {
    const left = hashTreasuryPayload({
      descripcion: "Deposito",
      checkIds: ["b", "a"],
      importe: "10.0000",
    });
    const right = hashTreasuryPayload({
      importe: "10.0000",
      checkIds: ["b", "a"],
      descripcion: "Deposito",
    });

    expect(left).toBe(right);
  });

  it("changes the hash when the business payload changes", () => {
    const original = hashTreasuryPayload({
      cuentaBancariaId: "account-1",
      importe: "10.0000",
    });
    const changed = hashTreasuryPayload({
      cuentaBancariaId: "account-2",
      importe: "10.0000",
    });

    expect(changed).not.toBe(original);
  });
});
