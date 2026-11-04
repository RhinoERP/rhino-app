import { describe, expect, it } from "vitest";
import type { QuoteFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import { mapQuoteFormItems } from "./quote-form-items";
import {
  computeQuoteItemSubtotal,
  convertQuoteItemsCurrency,
  repriceQuoteItems,
} from "./quote-form-pricing";
import { buildQuoteTaxLines, computeQuoteTotals } from "./quote-line-calcs";

const campera = {
  id: "campera",
  price: 100,
  costPrice: 50,
  currency: "ARS",
} as SaleProduct;
const buzo = {
  id: "buzo",
  price: 200,
  costPrice: 100,
  currency: "ARS",
} as SaleProduct;
const usdProduct = {
  id: "usd-product",
  price: 5,
  costPrice: 2,
  currency: "USD",
} as SaleProduct;
const noPricing = { level: null, adjustment: null };

function makeItem(
  productId: string,
  unitPrice: number,
  extras: Array<{ description: string; price: number }> = [],
  productCurrency = "ARS"
): QuoteFormValues["items"][number] {
  return {
    productId,
    productName: productId,
    productCurrency,
    unitPrice,
    variants: [{ talle: "Único", color: "—", quantity: 1, extras }],
    totalQuantity: 1,
    subtotal: unitPrice + extras.reduce((sum, extra) => sum + extra.price, 0),
    discountPercentage: 0,
    taxes: [],
  };
}

describe("precios y extras del presupuesto", () => {
  it("convierte los extras existentes una sola vez al pasar de ARS a USD", () => {
    const [item] = convertQuoteItemsCurrency({
      items: [
        makeItem("campera", 100, [{ description: "Bordado", price: 50 }]),
      ],
      previousCurrency: "ARS",
      currency: "USD",
      exchangeRate: 1000,
    });

    expect(item.unitPrice).toBe(0.1);
    expect(item.variants[0].extras[0].price).toBe(0.05);
    expect(item.subtotal).toBe(0.15);

    // Los extras ingresados luego del cambio ya están en USD, incluso si el
    // producto originalmente era ARS; no deben volver a dividirse por la tasa.
    const withNewExtra = {
      ...item,
      variants: [
        {
          ...item.variants[0],
          extras: [
            ...item.variants[0].extras,
            { description: "Reflectivo", price: 2 },
          ],
        },
      ],
    };
    expect(computeQuoteItemSubtotal(withNewExtra)).toBe(2.15);
    expect(computeQuoteTotals({ items: [withNewExtra] }).subTotal).toBe(2.15);
    expect(buildQuoteTaxLines([withNewExtra])[0].gross).toBe(2.15);
    expect(
      mapQuoteFormItems([withNewExtra], "USD")[0].variants[0].extras
    ).toEqual([
      { description: "Bordado", price: 0.05 },
      { description: "Reflectivo", price: 2 },
    ]);
  });

  it("al cambiar cliente o margen recalcula todos los precios, incluso los editados", () => {
    const edited = makeItem("campera", 110, [
      { description: "Bordado", price: 20 },
    ]);
    const other = makeItem("buzo", 200);
    const adjustment = { type: "PERCENTAGE", value: 20 } as SalesPriceList;

    const [first, second] = repriceQuoteItems({
      items: [edited, other],
      products: [campera, buzo],
      pricing: { level: null, adjustment },
      currency: "ARS",
      exchangeRate: 1000,
    });

    expect(first.unitPrice).toBe(120);
    expect(first.variants[0].extras[0].price).toBe(20);
    expect(first.subtotal).toBe(140);
    expect(second.unitPrice).toBe(240);
    expect(second.subtotal).toBe(240);
  });

  it("al actualizar la tasa solo recalcula los productos de otra moneda", () => {
    const converted = makeItem("campera", 1, [
      { description: "Bordado", price: 2 },
    ]);
    const native = makeItem("usd-product", 5, [], "USD");
    const [updated, unchanged] = repriceQuoteItems({
      items: [converted, native],
      products: [campera, usdProduct],
      pricing: noPricing,
      currency: "USD",
      exchangeRate: 200,
      rateOnly: true,
      previousRate: 100,
    });
    expect(updated.unitPrice).toBe(0.5);
    expect(updated.variants[0].extras[0].price).toBe(2);
    expect(updated.subtotal).toBe(2.5);
    expect(unchanged).toBe(native);

    const [withoutRate] = repriceQuoteItems({
      items: [updated],
      products: [campera],
      pricing: noPricing,
      currency: "USD",
      exchangeRate: null,
      rateOnly: true,
      previousRate: 200,
    });
    expect(withoutRate).toBe(updated);

    const [arsFromUsd, arsNative] = repriceQuoteItems({
      items: [
        makeItem("usd-product", 500, [], "USD"),
        makeItem("campera", 110),
      ],
      products: [usdProduct, campera],
      pricing: noPricing,
      currency: "ARS",
      exchangeRate: 200,
      rateOnly: true,
      previousRate: 100,
    });
    expect(arsFromUsd.unitPrice).toBe(1000);
    expect(arsNative.unitPrice).toBe(110);

    const [editedConverted] = repriceQuoteItems({
      items: [makeItem("campera", 1.1)],
      products: [campera],
      pricing: noPricing,
      currency: "USD",
      exchangeRate: 200,
      previousRate: 100,
      rateOnly: true,
    });
    expect(editedConverted.unitPrice).toBe(0.55);
  });

  it("convierte el precio cotizado actual junto con los extras al cambiar de moneda", () => {
    const [usd] = convertQuoteItemsCurrency({
      items: [
        makeItem("campera", 110, [{ description: "Bordado", price: 20 }]),
      ],
      previousCurrency: "ARS",
      currency: "USD",
      exchangeRate: 100,
    });
    expect(usd.unitPrice).toBe(1.1);
    expect(usd.variants[0].extras[0].price).toBe(0.2);

    const [ars] = convertQuoteItemsCurrency({
      items: [usd],
      previousCurrency: "USD",
      currency: "ARS",
      exchangeRate: 100,
    });
    expect(ars.unitPrice).toBe(110);
    expect(ars.variants[0].extras[0].price).toBe(20);
    expect(ars.subtotal).toBe(130);
  });

  it("no reemplaza un ítem cuando el precio calculado no cambió", () => {
    const item = makeItem("campera", 100);
    const [same] = repriceQuoteItems({
      items: [item],
      products: [campera],
      pricing: noPricing,
      currency: "ARS",
      exchangeRate: 1000,
    });
    expect(same).toBe(item);
  });
});
