// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PurchaseDetailItems } from "./purchase-detail-items";

const SPACE = /\s/g;

vi.mock("@/components/ui/command", () => {
  const Container = ({ children }: { children: React.ReactNode }) => children;
  return {
    Command: Container,
    CommandList: Container,
    CommandGroup: Container,
    CommandItem: Container,
    CommandEmpty: Container,
    CommandInput: () => null,
  };
});
vi.mock("@/components/ui/popover", () => {
  const Container = ({ children }: { children: React.ReactNode }) => children;
  return {
    Popover: Container,
    PopoverTrigger: Container,
    PopoverContent: Container,
  };
});
vi.mock("../shared/purchase-item-tax-picker", () => ({
  PurchaseItemTaxPicker: () => null,
}));

it("conserva la misma base y costo operativo entre lectura y edición sin impuestos", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props = {
    items: [
      {
        id: "line",
        product_id: "product",
        product_name: "Producto",
        quantity: 1,
        unit_quantity: 1,
        unit_cost: 100.01,
        subtotal: 100.01,
        unit_of_measure: "UN",
        list_unit_cost: 100.01,
        persistedTaxes: [],
      },
    ],
    products: [],
    supplierId: "supplier",
    currency: "ARS",
    discountsEnabled: true,
    hasItemTaxSnapshots: true,
    onItemsChange: vi.fn(),
    onError: vi.fn(),
    taxes: [],
    productTaxes: new Map(),
    fallbackTaxes: [],
    globalDiscountPercent: 10,
    receivedProgress: {},
    variantMetaMap: {},
  };
  try {
    await act(() =>
      root.render(<PurchaseDetailItems {...props} isEditingDetails={false} />)
    );
    expect(container.textContent?.replace(SPACE, "")).toContain(
      "sinimpuestos:$90,01"
    );
    await act(() =>
      root.render(<PurchaseDetailItems {...props} isEditingDetails />)
    );
    expect(container.textContent?.replace(SPACE, "")).toContain(
      "sinimpuestos:$90,01"
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
