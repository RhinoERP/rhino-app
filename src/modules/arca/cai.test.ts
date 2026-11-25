import { describe, expect, it } from "vitest";
import {
  authorizationAvailability,
  caiActivationSchema,
  caiAuthorizationSchema,
  formatFiscalRemittanceNumber,
  parseCaiExpiration,
} from "./cai";

const authorization = caiAuthorizationSchema.parse({
  id: "60000000-0000-4000-8000-000000000001",
  organization_id: "10000000-0000-4000-8000-000000000001",
  cuit: "30710158230",
  point_of_sale: 9,
  mode: "self_printed",
  cai: "12345678901234",
  expires_at: "2026-12-31",
  state: "active",
  first_number: 1,
  last_number: 50,
  next_number: 50,
  issued_count: 49,
  printer_name: "",
  printer_cuit: "",
  printer_registration: "",
  printed_at: "",
  evidence: "Constancia 123",
  source_operation_id: null,
  created_at: "2026-11-23T00:00:00Z",
});

describe("CAI validity and numbering", () => {
  it("uses the authorized point and an eight-digit number", () => {
    expect(formatFiscalRemittanceNumber(9, 42)).toBe("00009-00000042");
  });
  it("accepts ARCA dates and rejects impossible dates", () => {
    expect(parseCaiExpiration("31/12/2026")).toBe("2026-12-31");
    expect(() => parseCaiExpiration("31/02/2026")).toThrow();
    expect(() => parseCaiExpiration("12/31/2026")).toThrow();
  });
  it("allows the last number and expiration day, then blocks further issuance", () => {
    expect(authorizationAvailability(authorization, "2026-12-31")).toBe(
      "available"
    );
    expect(
      authorizationAvailability(
        { ...authorization, next_number: 51 },
        "2026-12-31"
      )
    ).toBe("exhausted");
    expect(authorizationAvailability(authorization, "2027-01-01")).toBe(
      "expired"
    );
    expect(
      authorizationAvailability(
        { ...authorization, state: "cancelled" },
        "2026-11-23"
      )
    ).toBe("inactive");
  });
  it("does not assume a finite quantity for an autoimpresor authorization", () => {
    expect(
      authorizationAvailability(
        { ...authorization, last_number: null, next_number: 1000 },
        "2026-11-23"
      )
    ).toBe("available");
  });
  it("requires explicit verification and a consistent continuation number", () => {
    const input = {
      authorizationId: authorization.id,
      firstNumber: 100,
      lastNumber: 200,
      lastUsedNumber: 99,
      printerName: "",
      printerCuit: "",
      printerRegistration: "",
      printedAt: "",
      evidence: "Constancia 123",
      confirmed: true,
    };
    expect(caiActivationSchema.safeParse(input).success).toBe(true);
    expect(
      caiActivationSchema.safeParse({ ...input, lastUsedNumber: 98 }).success
    ).toBe(false);
    expect(
      caiActivationSchema.safeParse({ ...input, lastUsedNumber: 200 }).success
    ).toBe(false);
    expect(
      caiActivationSchema.safeParse({ ...input, confirmed: false }).success
    ).toBe(false);
  });
});
