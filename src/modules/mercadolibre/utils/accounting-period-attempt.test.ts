import { describe, expect, it, vi } from "vitest";
import {
  meliPeriodAttemptSchema,
  meliPeriodAttemptStorageKey,
  readMeliPeriodAttempt,
} from "./accounting-period-attempt";

const request = {
  periodStart: "2026-11-01",
  expectedStatus: "UNCONFIGURED",
  newStatus: "OPEN",
  reason: "Apertura inicial",
  requestKey: "00000000-0000-4000-8000-000000000001",
  expectedActorId: "00000000-0000-4000-8000-000000000002",
};

describe("recuperación del cambio de período Meli", () => {
  it("uses separate storage keys for each organization and fiscal origin", () => {
    const invoice = { type: "invoice" as const, saleId: "sale" };
    const note = {
      type: "creditNote" as const,
      saleId: "sale",
      creditNoteId: "note",
    };
    expect(meliPeriodAttemptStorageKey("org", invoice)).not.toBe(
      meliPeriodAttemptStorageKey("other", invoice)
    );
    expect(meliPeriodAttemptStorageKey("org", invoice)).not.toBe(
      meliPeriodAttemptStorageKey("org", note)
    );
  });

  it("restores the original key, actor and payload or reports no saved request", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(request)),
    };
    expect(readMeliPeriodAttempt(storage, "key")).toEqual(request);
    storage.getItem.mockReturnValue(null);
    expect(readMeliPeriodAttempt(storage, "key")).toBeNull();
  });

  it("rejects malformed or altered stored requests instead of creating a new one", () => {
    for (const value of [
      "{",
      JSON.stringify({ ...request, requestKey: "invalid" }),
      JSON.stringify({ ...request, expectedActorId: undefined }),
      JSON.stringify({ ...request, newStatus: "UNCONFIGURED" }),
      JSON.stringify({ ...request, extra: true }),
    ]) {
      expect(() =>
        readMeliPeriodAttempt({ getItem: () => value }, "key")
      ).toThrow("no es verificable");
    }
  });

  it("propagates unavailable storage and refuses no-op changes", () => {
    expect(() =>
      readMeliPeriodAttempt(
        {
          getItem: () => {
            throw new Error("Almacenamiento inaccesible");
          },
        },
        "key"
      )
    ).toThrow("Almacenamiento inaccesible");
    expect(
      meliPeriodAttemptSchema.safeParse({
        ...request,
        expectedStatus: "OPEN",
      }).success
    ).toBe(false);
  });
});
