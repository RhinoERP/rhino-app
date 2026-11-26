import { describe, expect, it } from "vitest";
import {
  assertMeliDispatchMatchesSource,
  type MeliDispatchSource,
} from "./accounting-dispatch-source";
import type { MeliPaymentRecoveryPayload } from "./accounting-payment-recovery";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const payload: MeliPaymentRecoveryPayload = {
  orgId: first,
  originType: "payment",
  originId: first,
  requestKey: first,
  componentKey: "net",
  date: "2026-11-23",
  description: "Cobro",
  actorId: first,
  currency: "USD",
  exchangeRate: "1325.75",
  lines: [
    {
      accountId: first,
      side: "DEBE",
      originalAmount: "1.00",
      pesosAmount: "1325.75",
    },
    {
      accountId: second,
      side: "HABER",
      originalAmount: "1",
      pesosAmount: "1325.75",
    },
  ],
};
const source: MeliDispatchSource = {
  sale_id: first,
  payment_date: "2026-11-23",
  currency: "USD",
  payment_status: "RECORDED",
  preparation_status: "PREPARED",
  component_amount: "1.0000",
  debit_account: { kind: "semantic", code: "MERCADO_PAGO" },
  credit_account: { kind: "manual", id: second },
};
const accounts = [
  { id: first, account_code: "MERCADO_PAGO" },
  { id: second, account_code: null },
];
const fiscal = { currency: "USD" as const, exchangeRate: 1325.75 };

describe("dispatch source validation", () => {
  it("compares exact amount, conversion and account sides", () => {
    expect(() =>
      assertMeliDispatchMatchesSource(payload, source, accounts, fiscal)
    ).not.toThrow();
    expect(() =>
      assertMeliDispatchMatchesSource(
        { ...payload, date: "2026-11-24" },
        source,
        accounts,
        fiscal
      )
    ).toThrow("fecha");
    expect(() =>
      assertMeliDispatchMatchesSource(
        {
          ...payload,
          lines: [
            payload.lines[0],
            { ...payload.lines[1], originalAmount: "2" },
          ],
        },
        source,
        accounts,
        fiscal
      )
    ).toThrow("importe");
    expect(() =>
      assertMeliDispatchMatchesSource(
        payload,
        { ...source, credit_account: { kind: "manual", id: first } },
        accounts,
        fiscal
      )
    ).toThrow("cuenta");
    expect(() =>
      assertMeliDispatchMatchesSource(
        {
          ...payload,
          lines: [
            { ...payload.lines[0], side: "HABER" },
            { ...payload.lines[1], side: "DEBE" },
          ],
        },
        source,
        accounts,
        fiscal
      )
    ).toThrow("cuenta");
    expect(() =>
      assertMeliDispatchMatchesSource(
        payload,
        source,
        [{ id: first, account_code: "OTRA_CUENTA" }, accounts[1]],
        fiscal
      )
    ).toThrow("cuenta");
    expect(() =>
      assertMeliDispatchMatchesSource(
        payload,
        source,
        [
          ...accounts,
          {
            id: "00000000-0000-4000-8000-000000000003",
            account_code: "MERCADO_PAGO",
          },
        ],
        fiscal
      )
    ).not.toThrow();
  });
  it("rejects stale preparations, wrong currency and incorrect rounding", () => {
    expect(() =>
      assertMeliDispatchMatchesSource(
        payload,
        { ...source, payment_status: "VOIDED" },
        accounts,
        fiscal
      )
    ).toThrow("vigencia");
    expect(() =>
      assertMeliDispatchMatchesSource(
        payload,
        { ...source, currency: "ARS" },
        accounts,
        fiscal
      )
    ).toThrow("moneda");
    expect(() =>
      assertMeliDispatchMatchesSource(
        { ...payload, exchangeRate: "1000" },
        source,
        accounts,
        { ...fiscal, exchangeRate: 1000 }
      )
    ).toThrow("importe");
    expect(() =>
      assertMeliDispatchMatchesSource(payload, source, accounts, {
        ...fiscal,
        exchangeRate: 1000,
      })
    ).toThrow("cotización");
    expect(() =>
      assertMeliDispatchMatchesSource(payload, source, accounts, {
        currency: "ARS",
        exchangeRate: 1,
      })
    ).toThrow("moneda");
  });

  it("verifies voided sources only when explicitly reviewing a voided reservation", () => {
    const voided = { ...source, payment_status: "VOIDED" as const };
    const review = { ...fiscal, expectedPaymentStatus: "VOIDED" as const };
    expect(() =>
      assertMeliDispatchMatchesSource(payload, voided, accounts, review)
    ).not.toThrow();
    expect(() =>
      assertMeliDispatchMatchesSource(payload, source, accounts, review)
    ).toThrow("vigencia");
    expect(() =>
      assertMeliDispatchMatchesSource(payload, voided, accounts, fiscal)
    ).toThrow("vigencia");
  });
});
