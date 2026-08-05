import { describe, expect, it } from "vitest";
import { buildOrdenPago } from "./accounting-client";

const buildPayment = (referenceNumber?: string | null) =>
  buildOrdenPago(
    {
      id: "a882d5d1-1a17-45d6-80c3-f2b1de97dea1",
      organization_id: "organization-id",
      account_payable_id: "payable-id",
      amount: 85_000,
      payment_method: "cheque",
      payment_date: "2026-08-02",
      reference_number: referenceNumber,
    },
    {
      supplier_id: "supplier-id",
    }
  );

describe("buildOrdenPago", () => {
  it("uses the endorsed check information as the journal description", () => {
    const event = buildPayment("Cheques endosados N° 0001, 0002");

    expect(event.descripcion).toBe(
      "Orden de pago Cheques endosados N° 0001, 0002"
    );
  });

  it("does not expose the payment UUID when no reference exists", () => {
    const event = buildPayment();

    expect(event.descripcion).toBe("Orden de pago");
    expect(event.descripcion).not.toContain(event.referenciaId);
  });
});
