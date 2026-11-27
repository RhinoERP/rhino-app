import { describe, expect, it } from "vitest";
import { shouldResetScroll } from "./scroll-to-top-on-navigation";

describe("scroll on screen changes", () => {
  it("returns to the top when navigating to another screen", () => {
    expect(shouldResetScroll("/org/acme/visitas", "/org/acme/ventas", "")).toBe(
      true
    );
  });

  it("keeps the position for filters and links to a specific section", () => {
    expect(shouldResetScroll("/org/acme/ventas", "/org/acme/ventas", "")).toBe(
      false
    );
    expect(
      shouldResetScroll("/org/acme/ventas", "/org/acme/clientes", "#detalle")
    ).toBe(false);
  });
});
