import { describe, expect, it } from "vitest";
import {
  meliFiscalAttemptStorageKey,
  readMeliFiscalAttempt,
  saveMeliFiscalAttempt,
} from "./accounting-fiscal-attempt";

const request = {
  requestKey: "00000000-0000-4000-8000-000000000001",
  expectedActorId: "00000000-0000-4000-8000-000000000002",
};

describe("fiscal preparation retry", () => {
  it("keeps the original actor and key and separates invoice and note", () => {
    const invoice = { type: "invoice" as const, saleId: "sale" };
    const note = {
      type: "creditNote" as const,
      saleId: "sale",
      creditNoteId: "note",
    };
    expect(meliFiscalAttemptStorageKey("org", invoice)).not.toBe(
      meliFiscalAttemptStorageKey("org", note)
    );
    expect(
      readMeliFiscalAttempt({ getItem: () => JSON.stringify(request) }, "key")
    ).toEqual(request);
    expect(readMeliFiscalAttempt({ getItem: () => null }, "key")).toBeNull();
  });

  it("rejects malformed or forged persisted requests", () => {
    expect(() => readMeliFiscalAttempt({ getItem: () => "{" }, "key")).toThrow(
      "no es verificable"
    );
    expect(() =>
      readMeliFiscalAttempt(
        {
          getItem: () =>
            JSON.stringify({ ...request, actorId: request.expectedActorId }),
        },
        "key"
      )
    ).toThrow("no es verificable");
  });

  it("writes the exact request and refuses to replace an unresolved attempt", () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
    expect(saveMeliFiscalAttempt(storage, "key", request)).toEqual(request);
    expect(readMeliFiscalAttempt(storage, "key")).toEqual(request);
    expect(() => saveMeliFiscalAttempt(storage, "key", request)).toThrow(
      "Ya hay una solicitud"
    );
    expect(readMeliFiscalAttempt(storage, "key")).toEqual(request);
  });

  it("fails closed if storage throws or fails to retain the exact request", () => {
    expect(() =>
      saveMeliFiscalAttempt(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("Almacenamiento bloqueado");
          },
        },
        "key",
        request
      )
    ).toThrow("Almacenamiento bloqueado");
    expect(() =>
      saveMeliFiscalAttempt(
        { getItem: () => null, setItem: () => 1 },
        "key",
        request
      )
    ).toThrow("No se guardó");
  });
});
