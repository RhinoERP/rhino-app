import { describe, expect, it } from "vitest";
import {
  meliReportPeriodSchema,
  summarizeMeliCommercialPeriod,
  summarizeMeliSales,
} from "./commercial-report";

describe("Meli commercial reporting", () => {
  it("deducts only authorized notes and includes credits for sales outside the selected period", () => {
    const result = summarizeMeliCommercialPeriod(
      [
        {
          currency: "ARS",
          total_amount: 121,
          total_tax_amount: 21,
          arca_status: "authorized",
        },
      ],
      [
        { currency: "ARS", amount: 60.5, arcaStatus: "authorized" },
        { currency: "ARS", amount: 10, arcaStatus: "pending" },
        { currency: "USD", amount: 20, arcaStatus: "authorized" },
      ]
    );
    expect(result[0]).toMatchObject({
      total: 121,
      authorizedCredits: 60.5,
      reservedCredits: 70.5,
      netAfterCredits: 60.5,
    });
    expect(result[1]).toMatchObject({
      currency: "USD",
      total: 0,
      authorizedCredits: 20,
      netAfterCredits: -20,
    });
  });
  it("keeps currencies separate and reconciles cents across more than one database page", () => {
    const rows = Array.from({ length: 1200 }, () => ({
      currency: "ARS",
      total_amount: 1.01,
      total_tax_amount: 0.21,
      arca_status: "authorized",
    }));
    expect(
      summarizeMeliSales([
        ...rows,
        {
          currency: "USD",
          total_amount: 20,
          total_tax_amount: 0,
          arca_status: "pending",
        },
      ])
    ).toEqual([
      {
        currency: "ARS",
        count: 1200,
        total: 1212,
        taxes: 252,
        authorized: 1200,
        pending: 0,
        error: 0,
        notRequested: 0,
      },
      {
        currency: "USD",
        count: 1,
        total: 20,
        taxes: 0,
        authorized: 0,
        pending: 1,
        error: 0,
        notRequested: 0,
      },
    ]);
  });
  it("rejects invalid and reversed periods", () => {
    expect(
      meliReportPeriodSchema.safeParse({ from: "2026-02-30", to: "2026-03-01" })
        .success
    ).toBe(false);
    expect(
      meliReportPeriodSchema.safeParse({ from: "2026-11-16", to: "2026-11-15" })
        .success
    ).toBe(false);
  });
});
