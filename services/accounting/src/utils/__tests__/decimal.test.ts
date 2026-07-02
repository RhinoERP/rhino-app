import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  evaluateFormula,
  getNestedValue,
  isBalanced,
  safeStr,
  toDecimal,
} from "../decimal";

describe("toDecimal", () => {
  it("convierte string numérico a Decimal", () => {
    expect(toDecimal("1210.0000").equals(new Decimal("1210"))).toBe(true);
  });

  it("convierte number a Decimal", () => {
    // Simula el escenario donde llega un float del monolito convertido a string
    expect(toDecimal((210.0).toFixed(4)).equals(new Decimal("210"))).toBe(true);
  });

  it("retorna 0 para null", () => {
    expect(toDecimal(null).isZero()).toBe(true);
  });

  it("retorna 0 para undefined", () => {
    expect(toDecimal(undefined).isZero()).toBe(true);
  });

  it("retorna 0 para string vacío", () => {
    expect(toDecimal("").isZero()).toBe(true);
  });

  it("preserva 4 decimales de precisión", () => {
    expect(toDecimal("105.5000").toFixed(4)).toBe("105.5000");
  });
});

describe("safeStr", () => {
  it("retorna string con 4 decimales fijos", () => {
    expect(safeStr(new Decimal("1210"))).toBe("1210.0000");
  });

  it("no usa notación científica", () => {
    expect(safeStr(new Decimal("0.0001"))).toBe("0.0001");
  });

  it("redondea correctamente", () => {
    expect(safeStr(new Decimal("1.23456"))).toBe("1.2346");
  });
});

describe("getNestedValue", () => {
  const event = {
    tipoEvento: "VENTA",
    datos: {
      montoNeto: "1000.0000",
      montoIVA21: "210.0000",
      montoIVA105: "0.0000",
      totalFactura: "1210.0000",
    },
  };

  it("resuelve path de un nivel", () => {
    expect(getNestedValue(event, "tipoEvento")).toBe("VENTA");
  });

  it("resuelve path de dos niveles", () => {
    expect(getNestedValue(event, "datos.montoIVA21")).toBe("210.0000");
  });

  it("retorna undefined para path inexistente", () => {
    expect(getNestedValue(event, "datos.montoRetencionGan")).toBeUndefined();
  });

  it("retorna undefined si el objeto es null en algún segmento", () => {
    expect(getNestedValue(null, "datos.monto")).toBeUndefined();
  });
});

describe("evaluateFormula", () => {
  const event = {
    datos: {
      montoNeto: "1000.0000",
      montoIVA21: "210.0000",
      montoIVA105: "0.0000",
      totalFactura: "1210.0000",
    },
  };

  it("evalúa path simple", () => {
    const result = evaluateFormula("datos.montoNeto", event);
    expect(result.equals(new Decimal("1000"))).toBe(true);
  });

  it("evalúa suma de dos paths", () => {
    const result = evaluateFormula("datos.montoNeto+datos.montoIVA21", event);
    expect(result.equals(new Decimal("1210"))).toBe(true);
  });

  it("evalúa suma de tres paths", () => {
    const result = evaluateFormula(
      "datos.montoNeto+datos.montoIVA21+datos.montoIVA105",
      event
    );
    expect(result.equals(new Decimal("1210"))).toBe(true);
  });

  it("evalúa resta", () => {
    const result = evaluateFormula(
      "datos.totalFactura-datos.montoIVA21",
      event
    );
    expect(result.equals(new Decimal("1000"))).toBe(true);
  });

  it("retorna 0 para path inexistente (campo opcional ausente)", () => {
    const result = evaluateFormula("datos.montoRetencionGan", event);
    expect(result.isZero()).toBe(true);
  });

  it("no acumula error de punto flotante", () => {
    // Escenario clásico de imprecisión: 0.1 + 0.2 ≠ 0.3 en float64
    const floatEvent = { datos: { a: "0.1000", b: "0.2000" } };
    const result = evaluateFormula("datos.a+datos.b", floatEvent);
    expect(result.equals(new Decimal("0.3"))).toBe(true);
  });
});

describe("isBalanced", () => {
  it("retorna true cuando debe === haber", () => {
    expect(isBalanced(new Decimal("1210"), new Decimal("1210"))).toBe(true);
  });

  it("retorna true dentro de tolerancia", () => {
    expect(
      isBalanced(new Decimal("1210.0001"), new Decimal("1210"), 0.001)
    ).toBe(true);
  });

  it("retorna false fuera de tolerancia", () => {
    expect(isBalanced(new Decimal("1210.01"), new Decimal("1210"), 0.001)).toBe(
      false
    );
  });

  it("retorna false cuando hay diferencia significativa", () => {
    expect(isBalanced(new Decimal("1210"), new Decimal("1000"))).toBe(false);
  });
});
