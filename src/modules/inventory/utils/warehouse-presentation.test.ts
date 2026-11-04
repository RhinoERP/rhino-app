import { describe, expect, it } from "vitest";
import {
  getWarehouseFieldPresentation,
  shouldShowStockWarehouseFilter,
} from "./warehouse-presentation";

const principal = { id: "principal", name: "Principal", is_default: true };
const secondary = { id: "secondary", name: "Sucursal", is_default: false };

describe("warehouse field presentation", () => {
  it("hides the sole primary warehouse only after it is selected", () => {
    expect(getWarehouseFieldPresentation([principal], principal.id)).toBe(
      "hidden"
    );
    expect(getWarehouseFieldPresentation([principal], undefined)).toBe(
      "select"
    );
  });

  it("shows the sole secondary warehouse as context without a dropdown", () => {
    expect(getWarehouseFieldPresentation([secondary], secondary.id)).toBe(
      "text"
    );
  });

  it("preserves choice when multiple warehouses are accessible", () => {
    expect(
      getWarehouseFieldPresentation([principal, secondary], principal.id)
    ).toBe("select");
  });

  it("does not hide or replace an existing selection outside the available choices", () => {
    expect(getWarehouseFieldPresentation([principal], secondary.id)).toBe(
      "select"
    );
    expect(getWarehouseFieldPresentation([principal], secondary.id, true)).toBe(
      "text"
    );
  });

  it("represents locked and historical warehouses as information", () => {
    expect(
      getWarehouseFieldPresentation([principal, secondary], secondary.id, true)
    ).toBe("text");
  });

  it("distinguishes no authorized choices from the default warehouse case", () => {
    expect(getWarehouseFieldPresentation([], undefined)).toBe("empty");
  });
});

describe("stock warehouse filter visibility", () => {
  it("hides a redundant filter without changing the stock scope", () => {
    expect(shouldShowStockWarehouseFilter([{ is_active: true }])).toBe(false);
    expect(shouldShowStockWarehouseFilter([])).toBe(false);
  });

  it("keeps explicit URL selections visible even with a single warehouse", () => {
    expect(
      shouldShowStockWarehouseFilter([{ is_active: true }], principal.id)
    ).toBe(true);
  });

  it("keeps multiple warehouses and inactive stock contexts visible", () => {
    expect(
      shouldShowStockWarehouseFilter([
        { is_active: true },
        { is_active: false },
      ])
    ).toBe(true);
    expect(shouldShowStockWarehouseFilter([{ is_active: false }])).toBe(true);
  });
});
