import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listMeliJournalEntriesByOriginServer } from "./accounting-server";

const origin = {
  orgId: "00000000-0000-4000-8000-000000000001",
  referenciaId: "00000000-0000-4000-8000-000000000002",
  referenciaTabla: "mercadolibre_payments",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("accounting origin service client", () => {
  it("requests a scoped origin and validates the response", async () => {
    vi.stubEnv("ACCOUNTING_SERVICE_URL", "https://accounting.invalid");
    vi.stubEnv("ACCOUNTING_SERVICE_TOKEN", "test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(listMeliJournalEntriesByOriginServer(origin)).resolves.toEqual(
      []
    );
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/asientos/by-origin");
    expect(url.searchParams.get("org_id")).toBe(origin.orgId);
    expect(url.searchParams.get("referencia_id")).toBe(origin.referenciaId);
    expect(url.searchParams.get("referencia_tabla")).toBe(
      origin.referenciaTabla
    );
  });

  it("does not interpret service errors as an empty reconciliation", async () => {
    vi.stubEnv("ACCOUNTING_SERVICE_URL", "https://accounting.invalid");
    vi.stubEnv("ACCOUNTING_SERVICE_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Servicio no disponible" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        })
      )
    );
    await expect(listMeliJournalEntriesByOriginServer(origin)).rejects.toThrow(
      "Servicio no disponible"
    );
  });
});
