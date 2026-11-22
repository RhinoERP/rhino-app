import { describe, expect, it } from "vitest";
import {
  MELI_ACCOUNTING_COMPONENT_ACCOUNTS,
  MELI_ACCOUNTING_COUNTERPART_ACCOUNT,
  meliAccountingBreakdownSchema,
  validateMeliAccountingBreakdown,
} from "./accounting-breakdown";

const breakdown = {
  net: "80",
  discount: "5",
  commission: "10",
  shipping: "5",
};

describe("Meli accounting breakdown", () => {
  it("defines the agreed account for each component and the invoice counterpart", () => {
    expect(MELI_ACCOUNTING_COMPONENT_ACCOUNTS).toEqual({
      net: "MERCADO_PAGO",
      discount: "DESCUENTOS_OTORGADOS",
      commission: "COMISIONES_POR_VENTAS",
      shipping: "VIATICOS",
    });
    expect(MELI_ACCOUNTING_COUNTERPART_ACCOUNT).toBe("AR_DEUDORES_VENTAS");
  });

  it("accepts the four confirmed components when they match the gross amount", () => {
    expect(validateMeliAccountingBreakdown("100", breakdown)).toEqual(
      breakdown
    );
  });

  it("compares exact cents and permits zero components", () => {
    expect(
      validateMeliAccountingBreakdown("0.30", {
        net: "0.1",
        discount: "0.20",
        commission: "0",
        shipping: "0.00",
      })
    ).toMatchObject({ net: "0.1", discount: "0.20" });
  });

  it("supports the maximum gross amount without floating point rounding", () => {
    expect(
      validateMeliAccountingBreakdown("90071992547409.91", {
        net: "90071992547409.90",
        discount: "0.01",
        commission: "0",
        shipping: "0",
      })
    ).toMatchObject({ discount: "0.01" });
    expect(() =>
      validateMeliAccountingBreakdown("90071992547409.91", {
        net: "90071992547409.91",
        discount: "0.01",
        commission: "0",
        shipping: "0",
      })
    ).toThrow("no coincide");
  });

  it("rejects mismatches and zero gross payments", () => {
    expect(() => validateMeliAccountingBreakdown("100.01", breakdown)).toThrow(
      "no coincide"
    );
    expect(() =>
      validateMeliAccountingBreakdown("0", {
        net: "0",
        discount: "0",
        commission: "0",
        shipping: "0",
      })
    ).toThrow("mayor a cero");
  });

  it.each([
    "-1",
    "1.001",
    "NaN",
    "Infinity",
    "",
    "01",
    "90071992547409.92",
  ])("rejects invalid money %s", (amount) => {
    expect(() =>
      validateMeliAccountingBreakdown("100", { ...breakdown, net: amount })
    ).toThrow();
  });

  it("rejects unsupported concepts until their treatment is defined", () => {
    expect(() =>
      validateMeliAccountingBreakdown("100", {
        ...breakdown,
        withholding: "0",
      })
    ).toThrow();
  });

  it("includes manually classified additions and deductions in the exact gross balance", () => {
    const manualConcepts = [
      {
        description: "Otro cargo",
        accountId: "00000000-0000-4000-8000-000000000001",
        amount: "3.25",
        direction: "ADD",
      },
      {
        description: "Ajuste",
        accountId: "00000000-0000-4000-8000-000000000002",
        amount: "1.25",
        direction: "SUBTRACT",
      },
    ];
    expect(
      validateMeliAccountingBreakdown("102", {
        ...breakdown,
        manualConcepts,
      }).manualConcepts
    ).toEqual(manualConcepts);
    expect(() =>
      validateMeliAccountingBreakdown("100", {
        ...breakdown,
        manualConcepts,
      })
    ).toThrow("no coincide");
  });

  it("requires a valid account and positive amount for manual concepts", () => {
    expect(() =>
      validateMeliAccountingBreakdown("100", {
        ...breakdown,
        manualConcepts: [
          {
            description: "Ajuste",
            accountId: "not-an-account",
            amount: "0",
            direction: "ADD",
          },
        ],
      })
    ).toThrow();
  });

  it("reports invalid manual amounts without throwing from safeParse", () => {
    const result = meliAccountingBreakdownSchema.safeParse({
      ...breakdown,
      manualConcepts: [
        {
          description: "Ajuste",
          accountId: "00000000-0000-4000-8000-000000000001",
          amount: "invalido",
          direction: "ADD",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
