// @vitest-environment jsdom
import React, { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { SaleProduct } from "@/modules/sales/types";
import { PreSaleForm } from "./pre-sale-form";

const data = vi.hoisted(() => ({
  lists: [],
  settings: { configurable_price_lists_enabled: false },
  mutation: { isPending: false, mutateAsync: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/organizations/hooks/use-org-settings", () => ({
  useOrgSettings: () => ({ data: data.settings }),
}));
vi.mock("@/modules/sales-price-lists/hooks/use-sales-price-lists", () => ({
  useSalesPriceLists: () => ({ data: data.lists }),
}));
vi.mock("@/modules/sales/hooks/use-pre-sale-mutation", () => ({
  usePreSaleMutation: () => ({ createPreSale: data.mutation }),
}));
vi.mock(
  "@/modules/customer-supplier-assignments/actions/get-assignments-by-customer.action",
  () => ({
    getAssignmentsByCustomerAction: async () => [],
  })
);
vi.mock(
  "@/modules/price-lists/actions/get-price-list-items-batch.action",
  () => ({
    getPriceListItemsBatchAction: async () => [],
  })
);
vi.mock(
  "@/modules/sales/actions/get-sale-products-by-warehouse.action",
  () => ({
    getSaleProductsByWarehouseAction: async () => [],
  })
);
vi.mock("@/lib/supabase/session-client", () => ({
  hasActiveBrowserSession: async () => true,
  openLoginForCurrentPage: vi.fn(),
}));
vi.mock("@/components/ui/calendar", () => ({ Calendar: () => null }));
vi.mock("@/components/ui/popover", () => {
  const Container = ({ children }: { children: ReactNode }) => children;
  return {
    Popover: Container,
    PopoverTrigger: Container,
    PopoverContent: Container,
  };
});
vi.mock("@/components/ui/command", () => {
  const Container = ({ children }: { children: ReactNode }) => children;
  return {
    Command: Container,
    CommandGroup: Container,
    CommandList: Container,
    CommandEmpty: () => null,
    CommandInput: () => null,
    CommandItem: ({
      children,
      value,
      onSelect,
    }: {
      children: ReactNode;
      value?: string;
      onSelect?: () => void;
    }) => (
      <button data-value={value} onClick={onSelect} type="button">
        {children}
      </button>
    ),
  };
});

const product: SaleProduct = {
  id: "case-product",
  name: "CAM-001",
  sku: "CAM-001",
  price: 135_200,
  costPrice: 104_000,
  currency: "ARS",
  unitOfMeasure: "CAJA",
  unitsPerBox: 8,
  tracksStockUnits: false,
  totalQuantity: 100,
  totalUnitQuantity: null,
  averageQuantityPerUnit: null,
  hasVariants: false,
};

it("retains the box price and proportional total after adding CAM-001 and running price effects", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => {
      root.render(
        <PreSaleForm
          customers={[]}
          organization={{ name: "Test", cuit: null }}
          orgSlug="test"
          priceLevels={[]}
          products={[product]}
          sellers={[]}
          taxes={[]}
          warehouses={[]}
        />
      );
    });
    const choice = container.querySelector<HTMLButtonElement>(
      'button[data-value="case-product"]'
    );
    if (!choice) {
      throw new Error("Missing product choice");
    }
    expect(choice.textContent?.replace(/\s/g, "")).toContain(
      "$16.900,00xunidad"
    );
    expect(choice.textContent).not.toContain("x caja");
    await act(async () => choice.click());
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (!setter) {
      throw new Error("Missing input setter");
    }
    for (const [label, value] of [
      ["Cajas", "6"],
      ["Unidades sueltas", "13"],
    ]) {
      const input = container.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`
      );
      if (!input) {
        throw new Error(`Missing ${label}`);
      }
      await act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    const add = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Agregar"
    );
    if (!add) {
      throw new Error("Missing add button");
    }
    await act(async () => add.click());
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Cajas"]')
        ?.value
    ).toBe("7");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Unidades sueltas"]'
      )?.value
    ).toBe("5");
    expect(
      [...container.querySelectorAll("input")].some(
        (input) => input.value === "135200"
      )
    ).toBe(true);
    expect(container.textContent).toContain("7 cajas + 5 unidades");
    expect(container.textContent?.replace(/\s/g, "")).toContain(
      "$1.030.900,00"
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
