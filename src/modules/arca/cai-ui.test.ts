import { describe, expect, it } from "vitest";
import type { CaiOperation, CaiSettings } from "./cai";
import {
  canReconcileCaiOperation,
  hasCaiCancellationValidation,
  hasCaiRequestValidation,
} from "./cai-ui";

const now = Date.parse("2026-11-24T12:00:00Z");
const settings: CaiSettings = {
  enabled: true,
  mode: "self_printed",
  loginCuit: "20111111112",
  pointOfSale: 9,
  businessName: "Safe",
  address: "Calle 123",
  vatCondition: "IVA RESPONSABLE INSCRITO",
  grossIncome: "123",
  activityStart: "2020-01-01",
};
const operation: CaiOperation = {
  id: "80000000-0000-4000-8000-000000000001",
  organization_id: "10000000-0000-4000-8000-000000000001",
  request_key: "70000000-0000-4000-8000-000000000001",
  kind: "validate",
  state: "complete",
  provider_id: "job",
  params: {
    cuit: "30710158230",
    username: settings.loginCuit,
    comprobantes: [{ puntoVenta: 9, tipoComprobante: 91, cantidad: 50 }],
  },
  result: { status: "validated" },
  error: null,
  created_at: "2026-11-24T11:59:00Z",
};
const valid = (op: CaiOperation = operation, quantity = 50) =>
  hasCaiRequestValidation({
    operations: [op],
    settings,
    cuit: "30-71015823-0",
    quantity,
    now,
  });

describe("CAI controls match the server's prerequisites", () => {
  it("only enables a request after a matching recent validation", () => {
    expect(valid()).toBe(true);
    expect(valid(operation, 51)).toBe(false);
    expect(valid({ ...operation, state: "failed" })).toBe(false);
  });
  it("expires request validation after one hour", () => {
    expect(valid({ ...operation, created_at: "2026-11-24T11:00:00Z" })).toBe(
      false
    );
  });
  it.each([
    { cuit: "20111111112" },
    { username: "30999999999" },
    { comprobantes: [{ puntoVenta: 10, tipoComprobante: 91, cantidad: 50 }] },
    { comprobantes: [{ puntoVenta: 9, tipoComprobante: 1, cantidad: 50 }] },
    { comprobantes: [null] },
    { comprobantes: "invalid" },
  ])("rejects validation for another request or malformed response %s", (params) => {
    expect(
      valid({ ...operation, params: { ...operation.params, ...params } })
    ).toBe(false);
  });
  it.each([
    0,
    -1,
    0.5,
    Number.NaN,
    100_000_000,
  ])("rejects invalid quantities %s", (quantity) => {
    expect(valid(operation, quantity)).toBe(false);
  });
  it("requires a recent cancellation check for the same CAI", () => {
    const check: CaiOperation = {
      ...operation,
      kind: "check_cancel",
      params: { cai: "12345678901234" },
      result: { status: "cancellable" },
    };
    expect(hasCaiCancellationValidation([check], "12345678901234", now)).toBe(
      true
    );
    expect(hasCaiCancellationValidation([check], "22345678901234", now)).toBe(
      false
    );
    expect(
      hasCaiCancellationValidation(
        [{ ...check, created_at: "2026-11-24T11:45:00Z" }],
        "12345678901234",
        now
      )
    ).toBe(false);
  });
  it("allows reconciliation after uncertainty or the processing grace period", () => {
    expect(
      canReconcileCaiOperation({ ...operation, state: "pending" }, now)
    ).toBe(false);
    expect(
      canReconcileCaiOperation({ ...operation, state: "uncertain" }, now)
    ).toBe(true);
    expect(
      canReconcileCaiOperation(
        { ...operation, state: "pending", created_at: "2026-11-24T11:50:00Z" },
        now
      )
    ).toBe(true);
    expect(canReconcileCaiOperation(operation, now)).toBe(false);
  });
});
