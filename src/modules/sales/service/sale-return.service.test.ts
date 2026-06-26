import { describe, expect, it } from "vitest";
import {
  buildCreditNoteItemsFromReturn,
  buildCreditNoteSourceDocumentsFromReturn,
  buildCreditNoteTaxesFromReturn,
  resolveReturnLines,
  type SaleReturnSourceSale,
} from "./sale-return.service";

const QUANTITY_ERROR_PATTERN = /supera lo disponible/;
const UNIT_QUANTITY_ERROR_PATTERN =
  /cantidad de unidades.*supera lo disponible/;
const REQUIRED_UNIT_QUANTITY_ERROR_PATTERN = /Debe indicar unidades/;

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
        unit_quantity: null,
        unit_price: 100,
        base_price: 100,
        discount_amount: 50,
        subtotal: 1000,
        product: { name: "Producto" },
        item_taxes: null,
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

  it("calcula una devolución por kg con el impuesto del producto original", () => {
    const sale = buildSale();
    sale.sub_total = 1272.69;
    sale.global_discount_amount = 0;
    sale.items = [
      {
        id: "sale-item-kg",
        product_id: "product-kg",
        description: "Producto por kg",
        quantity: 2,
        unit_quantity: 9,
        unit_price: 141.41,
        base_price: 141.41,
        discount_amount: 0,
        subtotal: 1272.69,
        product: { name: "Producto por kg" },
        item_taxes: [
          {
            id: "item-tax-1",
            tax_id: "tax-iva-21",
            name: "IVA 21%",
            rate: 21,
            tax_amount: 267.26,
            base_amount: 1272.69,
            tax_code_snapshot: "IVA_21",
            source: "product",
          },
        ],
      },
    ];

    const lines = resolveReturnLines({
      sale,
      returnItems: [
        {
          salesOrderItemId: "sale-item-kg",
          productId: "product-kg",
          quantity: 4,
          unitPrice: 141.41,
          unitQuantity: 1,
        },
      ],
      previouslyReturnedByItemId: new Map(),
    });

    expect(lines[0]).toMatchObject({
      quantity: 4,
      unitPrice: 141.41,
      netAmount: 565.64,
      taxAmount: 118.78,
      totalAmount: 684.42,
    });
    expect(
      buildCreditNoteTaxesFromReturn({ sale, returnedNetAmount: 565.64, lines })
    ).toEqual([
      {
        taxId: "tax-iva-21",
        name: "IVA 21%",
        rate: 21,
        baseAmount: 565.64,
        taxAmount: 118.78,
        taxCodeSnapshot: "IVA_21",
      },
    ]);
  });

  it("no permite devolver más unidades que las compradas en ventas por kg", () => {
    const sale = buildSale();
    sale.items = [
      {
        id: "sale-item-kg",
        product_id: "product-kg",
        description: "Producto por kg",
        quantity: 2,
        unit_quantity: 9,
        unit_price: 141.41,
        base_price: 141.41,
        discount_amount: 0,
        subtotal: 1272.69,
        product: { name: "Producto por kg" },
        item_taxes: null,
      },
    ];

    expect(() =>
      resolveReturnLines({
        sale,
        returnItems: [
          {
            salesOrderItemId: "sale-item-kg",
            productId: "product-kg",
            quantity: 1,
            unitPrice: 141.41,
            unitQuantity: 3,
          },
        ],
        previouslyReturnedByItemId: new Map(),
      })
    ).toThrow(UNIT_QUANTITY_ERROR_PATTERN);
  });

  it("requiere unidades explícitas cuando la devolución por kg las informa", () => {
    const sale = buildSale();
    sale.items = [
      {
        id: "sale-item-kg",
        product_id: "product-kg",
        description: "Producto por kg",
        quantity: 2,
        unit_quantity: 9,
        unit_price: 141.41,
        base_price: 141.41,
        discount_amount: 0,
        subtotal: 1272.69,
        product: { name: "Producto por kg" },
        item_taxes: null,
      },
    ];

    expect(() =>
      resolveReturnLines({
        sale,
        returnItems: [
          {
            salesOrderItemId: "sale-item-kg",
            productId: "product-kg",
            quantity: 1,
            unitPrice: 141.41,
            unitQuantity: 0,
          },
        ],
        previouslyReturnedByItemId: new Map(),
      })
    ).toThrow(REQUIRED_UNIT_QUANTITY_ERROR_PATTERN);
  });

  it("descuenta unidades ya devueltas en ventas por kg", () => {
    const sale = buildSale();
    sale.items = [
      {
        id: "sale-item-kg",
        product_id: "product-kg",
        description: "Producto por kg",
        quantity: 2,
        unit_quantity: 9,
        unit_price: 141.41,
        base_price: 141.41,
        discount_amount: 0,
        subtotal: 1272.69,
        product: { name: "Producto por kg" },
        item_taxes: null,
      },
    ];

    expect(() =>
      resolveReturnLines({
        sale,
        returnItems: [
          {
            salesOrderItemId: "sale-item-kg",
            productId: "product-kg",
            quantity: 1,
            unitPrice: 141.41,
            unitQuantity: 2,
          },
        ],
        previouslyReturnedByItemId: new Map([
          ["sale-item-kg", { quantity: 4, unitQuantity: 1 }],
        ]),
      })
    ).toThrow(UNIT_QUANTITY_ERROR_PATTERN);
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
