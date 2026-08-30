import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  buildArcaQrPayload,
  buildArcaQrVerifierUrl,
  formatDateToArgentinaIsoDate,
} from "./arca-qr";

const MISSING_USD_RATE_ERROR = /cotización fiscal autorizada/;

describe("arca QR helper", () => {
  it("convierte la fecha fiscal a America/Argentina/Buenos_Aires", () => {
    expect(formatDateToArgentinaIsoDate("2026-06-09T02:30:00.000Z")).toBe(
      "2026-06-08"
    );
  });

  it("genera URL con JSON codificado en Base64 estándar", () => {
    const payload = buildArcaQrPayload({
      issueDate: "2026-06-09T15:00:00.000Z",
      issuerCuit: "30-00000000-7",
      pointOfSale: 1,
      voucherTypeCode: 6,
      voucherNumber: 123,
      totalAmount: 1210,
      receiverDocumentType: 80,
      receiverDocumentNumber: 20_123_456_783,
      authorizationCode: "70417054367476",
    });
    const url = buildArcaQrVerifierUrl(payload);
    const parsed = new URL(url);
    const encodedPayload = parsed.searchParams.get("p");

    expect(parsed.origin + parsed.pathname).toBe(
      "https://www.arca.gob.ar/fe/qr/"
    );
    expect(encodedPayload).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(encodedPayload ?? "", "base64").toString("utf-8")
    ) as typeof payload;

    expect(decoded).toEqual(payload);
    expect(encodedPayload).toBe(
      Buffer.from(JSON.stringify(payload), "utf-8").toString("base64")
    );
  });

  it("no genera un QR USD con una cotización ARS por defecto", () => {
    expect(() =>
      buildArcaQrPayload({
        issueDate: "2026-08-30",
        issuerCuit: "20-12345678-3",
        pointOfSale: 1,
        voucherTypeCode: 1,
        voucherNumber: 1,
        totalAmount: 100,
        currency: "DOL",
        authorizationCode: "12345678901234",
      })
    ).toThrow(MISSING_USD_RATE_ERROR);
  });
});
