import { describe, expect, it } from "vitest";
import { buildMeliAccountingComponents } from "./accounting-components";

const breakdown = {
  net: "80",
  discount: "5",
  commission: "10",
  shipping: "5",
};
const counterpart = { kind: "semantic", code: "AR_DEUDORES_VENTAS" };

describe("Meli accounting component preview", () => {
  it("creates the four separately balanced components with the agreed orientation", () => {
    const components = buildMeliAccountingComponents("100", breakdown);
    expect(components.map((component) => component.amount)).toEqual([
      "80",
      "5",
      "10",
      "5",
    ]);
    expect(components.map((component) => component.debit)).toEqual([
      { kind: "semantic", code: "MERCADO_PAGO" },
      { kind: "semantic", code: "DESCUENTOS_OTORGADOS" },
      { kind: "semantic", code: "COMISIONES_POR_VENTAS" },
      { kind: "semantic", code: "VIATICOS" },
    ]);
    expect(components.map((component) => component.credit)).toEqual([
      counterpart,
      counterpart,
      counterpart,
      counterpart,
    ]);
  });

  it("omits zero components and retains exact decimal strings", () => {
    expect(
      buildMeliAccountingComponents("0.30", {
        net: "0.10",
        discount: "0.20",
        commission: "0.00",
        shipping: "0",
      }).map(({ key, amount }) => ({ key, amount }))
    ).toEqual([
      { key: "net", amount: "0.10" },
      { key: "discount", amount: "0.20" },
    ]);
  });

  it("accepts database numeric scale only when extra digits are zero", () => {
    expect(buildMeliAccountingComponents("100.0000", breakdown)).toHaveLength(
      4
    );
    expect(() =>
      buildMeliAccountingComponents("100.0001", breakdown)
    ).toThrow();
  });

  it("reverses manual deduction orientation and gives manual lines stable identities", () => {
    const accountId = "00000000-0000-4000-8000-000000000001";
    const components = buildMeliAccountingComponents("100", {
      ...breakdown,
      manualConcepts: [
        { description: "Cargo", accountId, amount: "3.25", direction: "ADD" },
        {
          description: "Ajuste",
          accountId,
          amount: "3.25",
          direction: "SUBTRACT",
        },
      ],
    });
    expect(components.slice(-2)).toEqual([
      {
        key: "manual:1",
        description: "Cargo",
        amount: "3.25",
        debit: { kind: "manual", id: accountId },
        credit: counterpart,
      },
      {
        key: "manual:2",
        description: "Ajuste",
        amount: "3.25",
        debit: counterpart,
        credit: { kind: "manual", id: accountId },
      },
    ]);
  });

  it("never previews an unbalanced or invalid stored breakdown", () => {
    expect(() => buildMeliAccountingComponents("101", breakdown)).toThrow(
      "no coincide"
    );
    expect(() =>
      buildMeliAccountingComponents("100", { ...breakdown, net: "80.001" })
    ).toThrow();
  });
});
