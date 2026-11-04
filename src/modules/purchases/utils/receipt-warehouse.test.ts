import { describe, expect, it } from "vitest";
import {
  type ReceiptWarehouseContext,
  resolveReceiptRetryWarehouseId,
  resolveReceiptWarehouseId,
} from "./receipt-warehouse";

const principal = { id: "principal", name: "Principal" };
const branch = { id: "branch", name: "Sucursal" };
const independent: ReceiptWarehouseContext = {
  warehouses: [principal, branch],
  lockedWarehouse: null,
};

describe("depósito por recepción", () => {
  it("permite destinos distintos para entregas independientes de una compra", () => {
    expect(resolveReceiptWarehouseId(independent, principal.id)).toBe(
      principal.id
    );
    expect(resolveReceiptWarehouseId(independent, branch.id)).toBe(branch.id);
  });

  it("exige elegir si hay varios depósitos habilitados", () => {
    expect(() => resolveReceiptWarehouseId(independent)).toThrow("Seleccioná");
  });

  it("usa automáticamente el único destino habilitado", () => {
    expect(
      resolveReceiptWarehouseId({ warehouses: [branch], lockedWarehouse: null })
    ).toBe(branch.id);
  });

  it("hereda el destino del pedido sin ofrecer fallback al principal", () => {
    const linked = { ...independent, lockedWarehouse: branch };
    expect(resolveReceiptWarehouseId(linked)).toBe(branch.id);
    expect(() => resolveReceiptWarehouseId(linked, principal.id)).toThrow(
      "depósito del pedido"
    );
  });

  it("rechaza un depósito vinculado sin acceso o inactivo", () => {
    expect(() =>
      resolveReceiptWarehouseId({
        warehouses: [principal],
        lockedWarehouse: branch,
      })
    ).toThrow("habilitado");
  });

  it("rechaza elegir un destino fuera de las asignaciones", () => {
    expect(() => resolveReceiptWarehouseId(independent, "otro")).toThrow(
      "habilitado"
    );
    expect(() =>
      resolveReceiptWarehouseId({ warehouses: [], lockedWarehouse: null })
    ).toThrow("habilitado");
  });

  it("un reintento conserva el depósito registrado aunque ya no sea seleccionable", () => {
    expect(resolveReceiptRetryWarehouseId(branch.id)).toBe(branch.id);
    expect(resolveReceiptRetryWarehouseId(branch.id, branch.id)).toBe(
      branch.id
    );
    expect(() =>
      resolveReceiptRetryWarehouseId(branch.id, principal.id)
    ).toThrow("No se puede cambiar");
  });

  it("no inventa un depósito para una recepción histórica incompleta", () => {
    expect(() => resolveReceiptRetryWarehouseId(null, principal.id)).toThrow(
      "no tiene depósito"
    );
  });
});
