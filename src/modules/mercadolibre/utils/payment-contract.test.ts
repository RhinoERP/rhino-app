import { describe, expect, it } from "vitest";
import {
  createMeliPaymentSchema,
  getMeliCollectionBalance,
  meliPaymentSalesFiltersSchema,
  parseMeliPaymentSearchParams,
  serializeMeliPayment,
  voidMeliPaymentSchema,
} from "./payment-contract";

const sale = {
  totalAmount: 121,
  currency: "ARS",
  status: "DELIVERED",
} as const;
const input = {
  saleId: "00000000-0000-4000-8000-000000000001",
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
  amount: 60.5,
  currency: "ARS",
  paymentDate: "2026-11-17",
  referenceNumber: "  00012345  ",
};

describe("gross Meli collection contracts", () => {
  it("parses URL filters without coercing empty currency/date fields into invalid database values", () => {
    const parsed = parseMeliPaymentSearchParams({
      page: "-2",
      dateFrom: "",
      dateTo: "",
      currency: "",
      view: "ALL",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        page: 1,
        view: "ALL",
        currency: undefined,
        dateFrom: undefined,
      });
    }
    expect(parseMeliPaymentSearchParams({ currency: "EUR" }).success).toBe(
      false
    );
  });
  it("tracks unpaid, partial and complete gross collections independently of invoicing", () => {
    expect(getMeliCollectionBalance(sale, [])).toEqual({
      collectedAmount: 0,
      outstandingAmount: 121,
      status: "UNPAID",
      canRegister: true,
    });
    expect(
      getMeliCollectionBalance(sale, [
        { amount: 60.5, currency: "ARS", status: "RECORDED" },
      ])
    ).toMatchObject({ status: "PARTIAL", outstandingAmount: 60.5 });
    expect(
      getMeliCollectionBalance(sale, [
        { amount: 60.5, currency: "ARS", status: "RECORDED" },
        { amount: 60.5, currency: "ARS", status: "RECORDED" },
      ])
    ).toMatchObject({ status: "PAID", canRegister: false });
  });
  it("keeps corrections in history while excluding voided loads from collection totals", () => {
    expect(
      getMeliCollectionBalance(sale, [
        { amount: 121, currency: "ARS", status: "VOIDED" },
        { amount: 60.5, currency: "ARS", status: "RECORDED" },
      ])
    ).toMatchObject({ collectedAmount: 60.5, status: "PARTIAL" });
    expect(
      voidMeliPaymentSchema.safeParse({
        paymentId: input.saleId,
        reason: "Error de carga",
      }).success
    ).toBe(true);
    expect(
      voidMeliPaymentSchema.safeParse({
        paymentId: input.saleId,
        reason: "Error de carga",
        amount: 100,
      }).success
    ).toBe(false);
  });
  it("never offers new collections for cancelled sales even if their history remains visible", () => {
    expect(
      getMeliCollectionBalance({ ...sale, status: "CANCELLED" }, [
        { amount: 60.5, currency: "ARS", status: "RECORDED" },
      ])
    ).toMatchObject({ status: "PARTIAL", canRegister: false });
  });
  it("preserves cents over many payments and rejects overcollection or mixed currencies", () => {
    expect(
      getMeliCollectionBalance(
        { ...sale, totalAmount: 1212 },
        Array.from({ length: 1200 }, () => ({
          amount: 1.01,
          currency: "ARS",
          status: "RECORDED",
        }))
      )
    ).toMatchObject({ collectedAmount: 1212, status: "PAID" });
    expect(() =>
      getMeliCollectionBalance(sale, [
        { amount: 121.01, currency: "ARS", status: "RECORDED" },
      ])
    ).toThrow("superan");
    expect(() =>
      getMeliCollectionBalance(sale, [
        { amount: 1, currency: "USD", status: "RECORDED" },
      ])
    ).toThrow("moneda");
  });
  it("preserves an operation identifier as text and sends no receivable, actor or accounting fields", () => {
    expect(serializeMeliPayment(createMeliPaymentSchema.parse(input))).toEqual({
      sales_order_id: input.saleId,
      amount: 60.5,
      currency: "ARS",
      payment_date: "2026-11-17",
      reference_number: "00012345",
      notes: "",
    });
    expect(
      createMeliPaymentSchema.safeParse({
        ...input,
        actorId: "forged",
        accountReceivableId: input.saleId,
      }).success
    ).toBe(false);
  });
  it.each([
    0,
    -1,
    1.001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects an invalid collected amount %s", (amount) => {
    expect(
      createMeliPaymentSchema.safeParse({ ...input, amount }).success
    ).toBe(false);
  });
  it("defaults the sale list to incomplete collections and validates literal search/date filters", () => {
    expect(meliPaymentSalesFiltersSchema.parse({})).toMatchObject({
      view: "PENDING",
      page: 1,
      pageSize: 20,
    });
    expect(
      meliPaymentSalesFiltersSchema.parse({ view: "ALL", search: "  Meli_%  " })
        .search
    ).toBe("Meli_%");
    expect(
      meliPaymentSalesFiltersSchema.safeParse({
        dateFrom: "2026-11-18",
        dateTo: "2026-11-17",
      }).success
    ).toBe(false);
    expect(
      meliPaymentSalesFiltersSchema.safeParse({ dateFrom: "2026-02-30" })
        .success
    ).toBe(false);
  });
});
