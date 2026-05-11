import { describe, expect, test } from "vitest";
import { formatTicketItemLines } from "./format-ticket-item-line";

const widths = {
  quantity: 11,
  product: 12,
  price: 10,
  subtotal: 12,
};

function linesFitWidth(lines: string[], maxWidth = 48) {
  return lines.every((line) => line.length <= maxWidth);
}

describe("formatTicketItemLines", () => {
  test("formats a short product in one aligned line", () => {
    const lines = formatTicketItemLines({
      quantity: "2",
      product: "Yerba",
      price: "$ 1.000,00",
      subtotal: "$ 2.000,00",
      widths,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("2           Yerba        $ 1.000,00   $ 2.000,00");
    expect(linesFitWidth(lines)).toBe(true);
  });

  test("abbreviates long products without moving price or subtotal columns", () => {
    const lines = formatTicketItemLines({
      quantity: "1",
      product: "Producto premium extra largo",
      price: "$ 99,00",
      subtotal: "$ 99,00",
      widths,
      overflowMode: "truncate",
    });

    expect(lines).toEqual(["1           Pro. pr. ex.    $ 99,00      $ 99,00"]);
    expect(lines[0]).not.toContain("...");
    expect(lines[0]?.slice(25, 35)).toBe("   $ 99,00");
    expect(lines[0]?.slice(36, 48)).toBe("     $ 99,00");
    expect(linesFitWidth(lines)).toBe(true);
  });

  test("wraps long products with continuation lines indented under product", () => {
    const lines = formatTicketItemLines({
      quantity: "1",
      product: "Producto premium extra largo",
      price: "$ 99,00",
      subtotal: "$ 99,00",
      widths,
      overflowMode: "wrap",
    });

    expect(lines).toEqual([
      "1           Producto        $ 99,00      $ 99,00",
      "            premium     ",
      "            extra largo ",
    ]);
    expect(linesFitWidth(lines)).toBe(true);
  });

  test("cuts long words with numbers so columns cannot overflow", () => {
    const lines = formatTicketItemLines({
      quantity: "1",
      product: "Producto123456789999999",
      price: "$ 50,00",
      subtotal: "$ 50,00",
      widths,
      overflowMode: "truncate",
    });

    expect(lines).toEqual(["1           Producto1234    $ 50,00      $ 50,00"]);
    expect(lines[0]).not.toContain("...");
    expect(linesFitWidth(lines)).toBe(true);
  });

  test("keeps all generated lines within a 48-character ticket width", () => {
    const lines = formatTicketItemLines({
      quantity: "123456789012345",
      product: "Producto con nombre extremadamente largo para ticket",
      price: "$ 123.456.789,00",
      subtotal: "$ 987.654.321,00",
      widths,
      overflowMode: "wrap",
    });

    expect(linesFitWidth(lines)).toBe(true);
  });
});
