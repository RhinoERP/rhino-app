import { describe, expect, it } from "vitest";
import {
  buildCreditNoteItemsFromReturn,
  buildCreditNoteSourceDocumentsFromReturn,
  buildCreditNoteTaxesFromReturn,
  resolveReturnLines,
  type SaleReturnSourceSale,
} from "./sale-return.service";

const QUANTITY_ERROR_PATTERN = /supera lo disponible/;

function buildSale(): SaleReturnSourceSale {
  return {
    id: "sale-1",
    status: "DELIVERED",
    customer_id: "customer-1",
    total_amount: 1210,
    sub_total: 1000,
    global_discount_amount: 100,
    invoice_type: "FACTURA_A",
    invoice_number: "FAC-0001",
    sale_date: "2026-06-01",
    arca_status: "authorized",
    arca_point_of_sale: 3,
    arca_voucher_number: 42,
    arca_voucher_type_code: 1,
    arca_authorized_at: "2026-06-01T12:00:00.000Z",
    items: [
      {
        id: "sale-item-1",
        product_id: "product-1",
        description: "Producto vendido",
        quantity: 10,
        unit_price: 100,
        discount_amount: 50,
        subtotal: 1000,
        product: { name: "Producto" },
      },
    ],
    taxes: [
      {
        id: "sale-tax-1",
        tax_id: "tax-1",
        name: "IVA 21%",
        rate: 21,
        tax_amount: 210,
        base_amount: 1000,
        tax_code_snapshot: "IVA_21",
      },
    ],
  };
}

describe("sale return credit-note helpers", () => {
  it("calcula líneas devueltas con descuentos, neto, impuestos y total", () => {
    const lines = resolveReturnLines({
      sale: buildSale(),
      returnItems: [
        {
          salesOrderItemId: "sale-item-1",
          productId: "product-1",
          quantity: 2,
          unitPrice: 100,
          itemCondition: "GOOD",
        },
      ],
      previouslyReturnedByItemId: new Map([["sale-item-1", 3]]),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      quantity: 2,
      unitPrice: 100,
      discountAmount: 30,
      netAmount: 170,
      taxAmount: 35.69,
      totalAmount: 205.69,
      restock: true,
    });
  });

  it("no permite devolver más que la cantidad disponible", () => {
    expect(() =>
      resolveReturnLines({
        sale: buildSale(),
        returnItems: [
          {
            salesOrderItemId: "sale-item-1",
            productId: "product-1",
            quantity: 8,
            unitPrice: 100,
          },
        ],
        previouslyReturnedByItemId: new Map([["sale-item-1", 3]]),
      })
    ).toThrow(QUANTITY_ERROR_PATTERN);
  });

  it("arma ítems, impuestos y comprobante fuente para la NC", () => {
    const sale = buildSale();
    const lines = resolveReturnLines({
      sale,
      returnItems: [
        {
          salesOrderItemId: "sale-item-1",
          productId: "product-1",
          quantity: 2,
          unitPrice: 100,
        },
      ],
      previouslyReturnedByItemId: new Map(),
    });
    const returnedNetAmount = lines.reduce(
      (total, line) => total + line.netAmount,
      0
    );

    expect(
      buildCreditNoteItemsFromReturn({
        saleId: "sale-1",
        lines,
        insertedReturnItems: [
          { id: "return-item-1", sales_order_item_id: "sale-item-1" },
        ],
      })
    ).toEqual([
      expect.objectContaining({
        salesOrderId: "sale-1",
        salesOrderItemId: "sale-item-1",
        salesReturnItemId: "return-item-1",
        productId: "product-1",
        description: "Producto vendido",
        quantity: 2,
      }),
    ]);

    expect(buildCreditNoteTaxesFromReturn({ sale, returnedNetAmount })).toEqual(
      [
        {
          taxId: "tax-1",
          name: "IVA 21%",
          rate: 21,
          baseAmount: returnedNetAmount,
          taxAmount: 35.69,
          taxCodeSnapshot: "IVA_21",
        },
      ]
    );

    expect(
      buildCreditNoteSourceDocumentsFromReturn({
        saleId: "sale-1",
        sale,
        returnTotal: 205.69,
      })
    ).toEqual([
      expect.objectContaining({
        salesOrderId: "sale-1",
        appliedAmount: 205.69,
        invoiceType: "FACTURA_A",
        invoiceNumber: "FAC-0001",
        arcaStatus: "authorized",
      }),
    ]);
  });
});
