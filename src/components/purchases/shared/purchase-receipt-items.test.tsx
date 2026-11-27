// @vitest-environment jsdom
import React, { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useFieldArray, useForm } from "react-hook-form";
import { expect, it, vi } from "vitest";
import type { ReceiptFormValues, ReceivedItemForm } from "./purchase-receipt";
import { PurchaseReceiptItems } from "./purchase-receipt-items";

vi.mock("@phosphor-icons/react", () => ({
  PlusCircle: () => null,
  Trash: () => null,
}));
vi.mock("lucide-react", () => ({ CalendarIcon: () => null }));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/card", () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Card: Container,
    CardContent: Container,
    CardDescription: Container,
    CardHeader: Container,
    CardTitle: Container,
  };
});
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    onCheckedChange,
    ...props
  }: React.ComponentProps<"input"> & {
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      {...props}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));
vi.mock("@/components/ui/calendar", () => ({ Calendar: () => null }));
vi.mock("@/components/ui/popover", () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Popover: Container,
    PopoverContent: Container,
    PopoverTrigger: Container,
  };
});
vi.mock("@/components/ui/separator", () => ({ Separator: () => <hr /> }));
vi.mock("@/components/ui/tooltip", () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Tooltip: Container,
    TooltipContent: Container,
    TooltipTrigger: Container,
  };
});

const noop = vi.fn();

const item: ReceivedItemForm = {
  itemId: "item-1",
  productId: "product-1",
  product_name: "CAM-001",
  received: true,
  orderedQuantity: 19,
  orderedUnitQuantity: 19,
  unitCost: 13,
  unit_of_measure: "CAJA",
  units_per_box: 8,
  has_variants: false,
  variant_stocks: null,
  lots: [
    {
      _key: "lot-1",
      lotNumber: "LOT-1",
      expirationDate: new Date("2027-01-01T00:00:00.000Z"),
      quantity: 19,
      unitQuantity: 19,
    },
  ],
};

function Harness() {
  const form = useForm<ReceiptFormValues>({
    defaultValues: { items: [item] },
  });
  const { fields } = useFieldArray({ control: form.control, name: "items" });
  return (
    <PurchaseReceiptItems
      allSelected={false}
      control={form.control}
      currency="ARS"
      isProcessing={false}
      itemFields={fields}
      onLoadVariantData={noop}
      onProcessSelected={noop}
      onToggleAll={noop}
      onVariantStockChange={noop}
      selectedCount={0}
      setValue={form.setValue}
      variantData={{}}
      variantStockValues={{}}
      watch={form.watch}
    />
  );
}

it("renders case receipt lot fields without requiring FormProvider", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<Harness />));
    const boxes = container.querySelector<HTMLInputElement>(
      'input[aria-label="Cajas"]'
    );
    const units = container.querySelector<HTMLInputElement>(
      'input[aria-label="Unidades sueltas"]'
    );
    expect(boxes?.value).toBe("2");
    expect(units?.value).toBe("3");
    expect(container.textContent).toContain("2 caja(s) + 3 un.");
    expect(container.textContent).toContain("Precio/caja ($)");
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
