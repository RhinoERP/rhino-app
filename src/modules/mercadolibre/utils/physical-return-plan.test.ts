import { describe, expect, it } from "vitest";
import {
  buildMeliPhysicalReturnPlan,
  createMeliPhysicalReturnSchema,
  type MeliPhysicalReturnInput,
  type MeliReturnOrigin,
} from "./physical-return-plan";

const saleId = "00000000-0000-4000-8000-000000000001";
const sourceMovementId = "00000000-0000-4000-8000-000000000002";
const otherMovementId = "00000000-0000-4000-8000-000000000003";
const input: MeliPhysicalReturnInput = {
  saleId,
  idempotencyKey: "00000000-0000-4000-8000-000000000004",
  returnDate: "2026-11-17",
  reason: "Mercadería recibida del comprador",
  items: [{ sourceMovementId, quantity: 0.3, restock: true }],
};
const origin: MeliReturnOrigin = {
  saleId,
  movementId: sourceMovementId,
  quantity: 1,
  unitQuantity: null,
  returnedQuantity: 0,
  returnedUnits: 0,
};

describe("Meli physical-return planning", () => {
  it("preserves a physical return intent without creating monetary or fiscal fields", () => {
    expect(buildMeliPhysicalReturnPlan(input, [origin])).toEqual({
      sales_order_id: saleId,
      return_date: "2026-11-17",
      reason: input.reason,
      allow_default_fallback: false,
      items: [
        {
          source_movement_id: sourceMovementId,
          quantity: 0.3,
          unit_quantity: 0,
          restock: true,
        },
      ],
    });
  });
  it("does not lose micro-units when receiving the exact fractional remainder", () => {
    expect(
      buildMeliPhysicalReturnPlan(
        {
          ...input,
          items: [{ sourceMovementId, quantity: 0.1, restock: true }],
        },
        [{ ...origin, quantity: 0.3, returnedQuantity: 0.2 }]
      ).items[0].quantity
    ).toBe(0.1);
    expect(() =>
      buildMeliPhysicalReturnPlan(input, [
        { ...origin, quantity: 0.3, returnedQuantity: 0.000_001 },
      ])
    ).toThrow("supera");
  });
  it("counts non-restocked physical receipts against the same outstanding quantity", () => {
    const noRestock = {
      ...input,
      items: [{ sourceMovementId, quantity: 0.3, restock: false }],
    };
    expect(
      buildMeliPhysicalReturnPlan(noRestock, [
        { ...origin, returnedQuantity: 0.7 },
      ]).items[0].restock
    ).toBe(false);
    expect(() =>
      buildMeliPhysicalReturnPlan(noRestock, [
        { ...origin, returnedQuantity: 0.8 },
      ])
    ).toThrow("supera");
  });
  it("bounds pieces independently of weight using signed original outbounds", () => {
    expect(
      buildMeliPhysicalReturnPlan(
        {
          ...input,
          items: [
            { sourceMovementId, quantity: 0.3, unitQuantity: 1, restock: true },
          ],
        },
        [{ ...origin, unitQuantity: -2, returnedUnits: 1 }]
      ).items[0].unit_quantity
    ).toBe(1);
    expect(() =>
      buildMeliPhysicalReturnPlan(
        {
          ...input,
          items: [
            { sourceMovementId, quantity: 0.3, unitQuantity: 2, restock: true },
          ],
        },
        [{ ...origin, unitQuantity: -2, returnedUnits: 1 }]
      )
    ).toThrow("supera");
  });
  it("supports piece-only reentries and source allocations that originally consumed no pieces", () => {
    expect(
      buildMeliPhysicalReturnPlan(
        {
          ...input,
          items: [
            { sourceMovementId, quantity: 0, unitQuantity: 1, restock: true },
          ],
        },
        [{ ...origin, unitQuantity: -1, returnedQuantity: 1 }]
      ).items[0].quantity
    ).toBe(0);
    expect(
      buildMeliPhysicalReturnPlan(input, [{ ...origin, unitQuantity: 0 }])
        .items[0].unit_quantity
    ).toBe(0);
  });
  it("rejects guessed origins, cross-sale lines and fabricated piece tracking", () => {
    expect(() => buildMeliPhysicalReturnPlan(input, [])).toThrow(
      "no pertenece"
    );
    expect(() =>
      buildMeliPhysicalReturnPlan(input, [
        { ...origin, saleId: otherMovementId },
      ])
    ).toThrow("no pertenece");
    expect(() =>
      buildMeliPhysicalReturnPlan(
        {
          ...input,
          items: [
            { sourceMovementId, quantity: 0.3, unitQuantity: 1, restock: true },
          ],
        },
        [origin]
      )
    ).toThrow("no registra piezas");
  });
  it("rejects duplicate origin identities and an invalid empty receipt", () => {
    expect(
      createMeliPhysicalReturnSchema.safeParse({
        ...input,
        items: [input.items[0], input.items[0]],
      }).success
    ).toBe(false);
    expect(
      createMeliPhysicalReturnSchema.safeParse({
        ...input,
        items: [{ sourceMovementId, quantity: 0, restock: false }],
      }).success
    ).toBe(false);
    expect(
      createMeliPhysicalReturnSchema.safeParse({
        ...input,
        items: [{ sourceMovementId, quantity: 0.000_000_1, restock: true }],
      }).success
    ).toBe(false);
  });
  it("canonicalizes line order for deterministic retries", () => {
    const second = {
      sourceMovementId: otherMovementId,
      quantity: 0.2,
      restock: false,
    };
    const origins = [origin, { ...origin, movementId: otherMovementId }];
    const forward = buildMeliPhysicalReturnPlan(
      { ...input, items: [input.items[0], second] },
      origins
    );
    const reverse = buildMeliPhysicalReturnPlan(
      { ...input, items: [second, input.items[0]] },
      origins
    );
    expect(reverse).toEqual(forward);
  });
});
