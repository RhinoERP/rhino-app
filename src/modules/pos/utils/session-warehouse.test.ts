import { describe, expect, it } from "vitest";
import { resolveSessionWarehouseId } from "./session-warehouse";

describe("depósito de apertura POS", () => {
  const warehouses = [{ id: "principal" }, { id: "sucursal" }];

  it("usa el único depósito habilitado sin exigir elección", () => {
    expect(resolveSessionWarehouseId([warehouses[0]])).toBe("principal");
  });

  it("exige elegir cuando hay varios depósitos habilitados", () => {
    expect(() => resolveSessionWarehouseId(warehouses)).toThrow();
    expect(resolveSessionWarehouseId(warehouses, "sucursal")).toBe("sucursal");
  });

  it("rechaza un depósito revocado aunque quede otro disponible", () => {
    expect(() =>
      resolveSessionWarehouseId([warehouses[0]], "sucursal")
    ).toThrow();
  });

  it("no permite abrir caja sin depósitos habilitados", () => {
    expect(() => resolveSessionWarehouseId([], "principal")).toThrow();
    expect(() => resolveSessionWarehouseId([])).toThrow();
  });
});
