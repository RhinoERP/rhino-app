import { describe, expect, it, vi } from "vitest";
import { publishPendingPaymentComponents } from "./publish-payment-components";

const components = [
  { key: "net", description: "Neto", dispatchStatus: "PUBLISHED" as const },
  {
    key: "commission",
    description: "Comisión",
    dispatchStatus: "UNCERTAIN" as const,
  },
  { key: "shipping", description: "Envío", dispatchStatus: null },
];

describe("publishPendingPaymentComponents", () => {
  it("retries uncertain and publishes pending components in order", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const result = await publishPendingPaymentComponents(components, publish);
    expect(result).toEqual({ success: true, confirmed: 2 });
    expect(publish.mock.calls).toEqual([["commission"], ["shipping"]]);
  });

  it("stops at the first failure and reports confirmed progress", async () => {
    const error = new Error("Sin respuesta");
    const publish = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);
    const result = await publishPendingPaymentComponents(
      [
        ...components,
        { key: "discount", description: "Descuento", dispatchStatus: null },
      ],
      publish
    );
    expect(result).toEqual({
      success: false,
      confirmed: 1,
      failedComponent: "Envío",
      error,
    });
    expect(publish.mock.calls).toEqual([["commission"], ["shipping"]]);
  });
});
