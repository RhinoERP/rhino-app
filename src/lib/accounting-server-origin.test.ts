import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  changeMeliPostingPeriodServer,
  findMeliPaymentJournalRequestServer,
  findMeliPaymentReversalServer,
  inspectMeliPaymentReversalSourceServer,
  inspectMeliPostingPeriodServer,
  listMeliJournalEntriesByOriginServer,
} from "./accounting-server";

const origin = {
  orgId: "00000000-0000-4000-8000-000000000001",
  referenciaId: "00000000-0000-4000-8000-000000000002",
  referenciaTabla: "mercadolibre_payments",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Meli recovery client", () => {
  it("sends a period change internally and rejects a mismatched receipt", async () => {
    vi.stubEnv("ACCOUNTING_SERVICE_URL", "https://accounting.invalid");
    vi.stubEnv("ACCOUNTING_SERVICE_TOKEN", "test-token");
    const request = {
      orgId: origin.orgId,
      periodStart: "2026-11-01",
      expectedStatus: "UNCONFIGURED" as const,
      newStatus: "OPEN" as const,
      actorId: origin.orgId,
      reason: "Apertura inicial",
      requestKey: origin.referenciaId,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: { status: "OPEN", idempotent: false } })
      )
      .mockResolvedValueOnce(
        Response.json({ data: { status: "CLOSED", idempotent: true } })
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(changeMeliPostingPeriodServer(request)).resolves.toEqual({
      status: "OPEN",
      idempotent: false,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://accounting.invalid/internal/meli/journal/period/change"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(
      request
    );
    await expect(changeMeliPostingPeriodServer(request)).rejects.toThrow(
      "no coincide"
    );
  });
  it("verifies the combined reversal source and rejects malformed responses", async () => {
    vi.stubEnv("ACCOUNTING_SERVICE_URL", "https://accounting.invalid");
    vi.stubEnv("ACCOUNTING_SERVICE_TOKEN", "test-token");
    const request = {
      original: {
        orgId: origin.orgId,
        originId: origin.referenciaId,
        originType: "payment" as const,
        componentKey: "net",
        requestKey: origin.orgId,
        date: "2026-11-23",
        description: "Cobro",
        actorId: origin.orgId,
        currency: "ARS" as const,
        exchangeRate: "1",
        lines: [
          {
            accountId: origin.orgId,
            side: "DEBE" as const,
            originalAmount: "1",
            pesosAmount: "1",
          },
          {
            accountId: origin.referenciaId,
            side: "HABER" as const,
            originalAmount: "1",
            pesosAmount: "1",
          },
        ],
      },
      reversal: {
        orgId: origin.orgId,
        originalEntryId: origin.referenciaId,
        requestKey: origin.orgId,
        date: "2026-11-23",
        description: "Reversión",
        actorId: origin.orgId,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: { originalEntryId: origin.referenciaId, reversalEntryId: null },
        })
      )
      .mockResolvedValueOnce(
        Response.json({ data: { originalEntryId: origin.referenciaId } })
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      inspectMeliPaymentReversalSourceServer(request)
    ).resolves.toEqual({
      originalEntryId: origin.referenciaId,
      reversalEntryId: null,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://accounting.invalid/internal/meli/reversal/source/inspect"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(
      request
    );
    await expect(
      inspectMeliPaymentReversalSourceServer(request)
    ).rejects.toThrow();
  });

  it("looks up a reversal internally and rejects a malformed receipt", async () => {
    vi.stubEnv("ACCOUNTING_SERVICE_URL", "https://accounting.invalid");
    vi.stubEnv("ACCOUNTING_SERVICE_TOKEN", "test-token");
    const request = {
      orgId: origin.orgId,
      originalEntryId: origin.referenciaId,
      requestKey: origin.orgId,
      date: "2026-11-23",
      description: "Reversión",
      actorId: origin.orgId,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: { reversalEntryId: null } }))
      .mockResolvedValueOnce(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(findMeliPaymentReversalServer(request)).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://accounting.invalid/internal/meli/reversal/lookup"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(
      request
    );
    await expect(findMeliPaymentReversalServer(request)).rejects.toThrow();
  });

  it("validates the period status without treating malformed data as an open period", async () => {
    vi.stubEnv("ACCOUNTING_SERVICE_URL", "https://accounting.invalid");
    vi.stubEnv("ACCOUNTING_SERVICE_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: { status: "UNCONFIGURED" } })
      )
      .mockResolvedValueOnce(Response.json({ data: { status: "UNKNOWN" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      inspectMeliPostingPeriodServer(origin.orgId, "2026-11-21")
    ).resolves.toEqual({ status: "UNCONFIGURED" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://accounting.invalid/internal/meli/journal/period/inspect"
    );
    await expect(
      inspectMeliPostingPeriodServer(origin.orgId, "2026-11-21")
    ).rejects.toThrow();
  });

  it("uses an internal endpoint and rejects malformed receipts", async () => {
    vi.stubEnv("ACCOUNTING_SERVICE_URL", "https://accounting.invalid");
    vi.stubEnv("ACCOUNTING_SERVICE_TOKEN", "test-token");
    const payload = {
      orgId: origin.orgId,
      originId: origin.referenciaId,
      originType: "payment" as const,
      componentKey: "net",
      requestKey: origin.orgId,
      date: "2026-11-23",
      description: "Cobro",
      actorId: origin.orgId,
      currency: "ARS" as const,
      exchangeRate: "1",
      lines: [
        {
          accountId: origin.orgId,
          side: "DEBE" as const,
          originalAmount: "1",
          pesosAmount: "1",
        },
        {
          accountId: origin.orgId,
          side: "HABER" as const,
          originalAmount: "1",
          pesosAmount: "1",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { journalEntryId: null } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      findMeliPaymentJournalRequestServer(payload)
    ).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://accounting.invalid/internal/meli/journal/lookup"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(
      payload
    );
    await expect(
      findMeliPaymentJournalRequestServer(payload)
    ).rejects.toThrow();
  });
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
