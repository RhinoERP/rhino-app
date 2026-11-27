// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseUnitQuantityFields } from "./case-unit-quantity-fields";
import { CaseUnitQuantitySummary } from "./case-unit-quantity-summary";

let container: HTMLDivElement;
let root: Root;
const changes = vi.fn();
const submit = vi.fn();

function Fixture({
  initial = 0,
  factor = 8,
}: {
  initial?: number;
  factor?: number;
}) {
  const [total, setTotal] = useState(initial);
  return (
    <>
      <CaseUnitQuantityFields
        onChange={(value) => {
          setTotal(value);
          changes(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            submit(total);
          }
        }}
        totalUnits={total}
        unitsPerBox={factor}
      />
      <output>{total}</output>
      <button onClick={() => setTotal(0)} type="button">
        Reset
      </button>
      <CaseUnitQuantitySummary
        items={[
          {
            productId: "CAM-001",
            name: "Campari 1LT",
            quantity: total,
            unitOfMeasure: "CAJA",
            unitsPerBox: factor,
          },
        ]}
      />
    </>
  );
}

function input(label: string): HTMLInputElement {
  const element = container.querySelector(`input[aria-label="${label}"]`);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing ${label}`);
  }
  return element;
}

function enter(label: string, value: string) {
  const element = input(label);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  if (!setter) {
    throw new Error("Missing input setter");
  }
  act(() => {
    element.focus();
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  changes.mockClear();
  submit.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("case quantity input interactions", () => {
  it("shows explicit zero values instead of blank box/unit fields", () => {
    act(() => root.render(<Fixture />));
    expect(input("Cajas").value).toBe("0");
    expect(input("Unidades sueltas").value).toBe("0");
  });

  it("normalizes the purchase example on blur, before adding it", () => {
    act(() => root.render(<Fixture />));
    enter("Cajas", "10");
    enter("Unidades sueltas", "12");
    expect(input("Cajas").value).toBe("10");
    expect(input("Unidades sueltas").value).toBe("12");
    expect(changes).toHaveBeenLastCalledWith(92);
    act(() => input("Unidades sueltas").blur());
    expect(input("Cajas").value).toBe("11");
    expect(input("Unidades sueltas").value).toBe("4");
    expect(container.textContent).toContain("11 cajas + 4 unidades");
  });

  it("keeps the 61-unit sale value through blur, Enter, and external reset", () => {
    act(() => root.render(<Fixture />));
    enter("Cajas", "6");
    enter("Unidades sueltas", "13");
    act(() =>
      input("Unidades sueltas").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    );
    expect(submit).toHaveBeenLastCalledWith(61);
    act(() => input("Unidades sueltas").blur());
    expect(input("Cajas").value).toBe("7");
    expect(input("Unidades sueltas").value).toBe("5");
    expect(container.textContent).toContain("7 cajas + 5 unidades");
    act(() => container.querySelector("button")?.click());
    expect(input("Cajas").value).toBe("0");
    expect(input("Unidades sueltas").value).toBe("0");
  });

  it("retains canonical quantities while editing and uses the new factor on external updates", () => {
    act(() =>
      root.render(
        <CaseUnitQuantityFields
          onChange={changes}
          totalUnits={19}
          unitsPerBox={8}
        />
      )
    );
    expect(input("Cajas").value).toBe("2");
    expect(input("Unidades sueltas").value).toBe("3");
    act(() =>
      root.render(
        <CaseUnitQuantityFields
          onChange={changes}
          totalUnits={19}
          unitsPerBox={6}
        />
      )
    );
    expect(input("Cajas").value).toBe("3");
    expect(input("Unidades sueltas").value).toBe("1");
  });

  it("does not commit fractional or negative individual counts", () => {
    act(() => root.render(<Fixture initial={19} />));
    enter("Unidades sueltas", "1.5");
    enter("Cajas", "-1");
    expect(changes).not.toHaveBeenCalled();
    expect(container.querySelector("output")?.textContent).toBe("19");
  });
});
