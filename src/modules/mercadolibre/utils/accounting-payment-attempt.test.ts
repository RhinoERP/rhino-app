import { describe, expect, it } from "vitest";
import {
  meliPaymentAttemptStorageKey,
  readMeliPaymentAttempt,
  saveMeliPaymentAttempt,
} from "./accounting-payment-attempt";

const paymentId = "00000000-0000-4000-8000-000000000001";
const attempt = {
  paymentId,
  draftId: "00000000-0000-4000-8000-000000000002",
  requestKey: "00000000-0000-4000-8000-000000000003",
  expectedActorId: "00000000-0000-4000-8000-000000000004",
};

describe("payment preparation attempts", () => {
  it("stores and restores the original request without allowing replacement", () => {
    let data: string | null = null;
    const storage = {
      getItem: () => data,
      setItem: (_key: string, value: string) => {
        data = value;
      },
    };
    const key = meliPaymentAttemptStorageKey("org", paymentId);
    expect(readMeliPaymentAttempt(storage, key, paymentId)).toBeNull();
    expect(saveMeliPaymentAttempt(storage, key, attempt)).toEqual(attempt);
    expect(readMeliPaymentAttempt(storage, key, paymentId)).toEqual(attempt);
    expect(() => saveMeliPaymentAttempt(storage, key, attempt)).toThrow(
      "Ya hay una solicitud"
    );
    expect(readMeliPaymentAttempt(storage, key, paymentId)).toEqual(attempt);
  });

  it("rejects malformed, foreign, or unavailable storage", () => {
    expect(() =>
      readMeliPaymentAttempt({ getItem: () => "{" }, "key", paymentId)
    ).toThrow("no es verificable");
    expect(() =>
      readMeliPaymentAttempt(
        { getItem: () => JSON.stringify(attempt) },
        "key",
        attempt.draftId
      )
    ).toThrow("no es verificable");
    expect(() =>
      saveMeliPaymentAttempt(
        { getItem: () => null, setItem: () => 1 },
        "key",
        attempt
      )
    ).toThrow("No se guardó");
    expect(() =>
      saveMeliPaymentAttempt(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("Almacenamiento bloqueado");
          },
        },
        "key",
        attempt
      )
    ).toThrow("Almacenamiento bloqueado");
  });
});
