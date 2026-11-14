import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { validWebhookSignature } = await import("./credit-purchases.service");

describe("firma del webhook de Mercado Pago", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("acepta la firma correcta y rechaza una alterada", () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "secreto");
    const manifest = "id:123;request-id:req-1;ts:1700000000;";
    const v1 = createHmac("sha256", "secreto").update(manifest).digest("hex");
    const base = { requestId: "req-1", dataId: "123" };
    expect(
      validWebhookSignature({ ...base, signature: `ts=1700000000,v1=${v1}` })
    ).toBe(true);
    expect(
      validWebhookSignature({ ...base, signature: "ts=1700000000,v1=abc" })
    ).toBe(false);
    expect(validWebhookSignature({ ...base, signature: null })).toBe(false);
  });

  it("sin clave configurada no la exige (igual se consulta el pago)", () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
    expect(
      validWebhookSignature({ signature: null, requestId: null, dataId: "1" })
    ).toBe(true);
  });
});
