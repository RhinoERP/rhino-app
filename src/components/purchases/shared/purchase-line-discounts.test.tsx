// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { PurchaseDiscountDetails } from "@/modules/purchases/utils/purchase-discounts";
import { PurchaseLineDiscounts } from "./purchase-line-discounts";

it("editar un descuento post factura actualiza el costo operativo sin cambiar el subtotal", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Form() {
    const [item, setItem] = useState<
      PurchaseDiscountDetails & { unit_cost: number; subtotal: number }
    >({
      unit_cost: 100,
      subtotal: 1000,
      post_invoice_volume_discount_percentage: 0,
    });
    return (
      <>
        <output>Subtotal fiscal: {item.subtotal}</output>
        <PurchaseLineDiscounts
          currency="ARS"
          editable
          item={item}
          netAmount={item.subtotal}
          onChange={(details) => setItem({ ...item, ...details })}
          onListCostChange={vi.fn()}
          taxAmount={210}
        />
      </>
    );
  }
  try {
    await act(() => root.render(<Form />));
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Volumen %"]'
    );
    if (!input) {
      throw new Error("Falta el porcentaje de volumen");
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (!setter) {
      throw new Error("Falta el setter del input");
    }
    await act(() => {
      setter.call(input, "20");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Subtotal fiscal: 1000");
    expect(container.textContent?.replace(/\s/g, "")).toContain(
      "Costooperativodelalínea:$800,00"
    );
    expect(input.value).toBe("20");
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
