import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
const lookupReversal = vi.hoisted(() => vi.fn());
const verifySource = vi.hoisted(() => vi.fn());
const inspectInvoice = vi.hoisted(() => vi.fn());
const periodQuery = vi.hoisted(() => vi.fn());
vi.mock("kysely", async (original) => {
  const actual = await original<typeof import("kysely")>();
  return {
    ...actual,
    sql: () => ({ execute: periodQuery }),
  };
});
vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../modules/journal/meli-journal.foundation", async (original) => {
  const actual =
    await original<
      typeof import("../modules/journal/meli-journal.foundation")
    >();
  return {
    ...actual,
    findMeliJournalFoundation: lookup,
    findMeliPaymentReversalFoundation: lookupReversal,
    verifyMeliReversalSourceFoundation: verifySource,
    inspectMeliInvoiceFoundation: inspectInvoice,
  };
});

const id = "00000000-0000-4000-8000-000000000001";
const input = {
  orgId: id,
  originType: "payment",
  originId: id,
  componentKey: "net",
  requestKey: id,
  date: "2026-11-23",
  description: "Cobro",
  actorId: id,
  currency: "ARS",
  exchangeRate: "1",
  lines: [
    { accountId: id, side: "DEBE", originalAmount: "1", pesosAmount: "1" },
    { accountId: id, side: "HABER", originalAmount: "1", pesosAmount: "1" },
  ],
};

describe("internal Meli journal lookup", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates, validates, and returns a found or absent receipt without writing", async () => {
    const { default: router } = await import("./meli-internal.routes");
    const { authMiddleware } = await import("../middleware/auth");
    const { errorMiddleware } = await import("../middleware/error");
    vi.stubEnv("SERVICE_TOKEN", "test-token");
    const app = express();
    app.use(express.json(), authMiddleware, router, errorMiddleware);
    const server = await new Promise<ReturnType<typeof app.listen>>(
      (resolve) => {
        const instance = app.listen(0, () => resolve(instance));
      }
    );
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/journal/lookup`;
    const post = (body: unknown, token?: string, endpoint = url) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-service-token": token } : {}),
        },
        body: JSON.stringify(body),
      });
    try {
      expect((await post(input)).status).toBe(401);
      expect(
        (await post({ ...input, originType: "invoice" }, "test-token")).status
      ).toBe(400);
      expect(lookup).not.toHaveBeenCalled();
      const invoice = {
        ...input,
        originType: "invoice",
        componentKey: "fiscal",
      };
      const note = {
        ...input,
        originType: "creditNote",
        componentKey: "fiscal",
      };
      lookup.mockResolvedValueOnce(undefined).mockResolvedValueOnce(id);
      const absent = await post(input, "test-token");
      expect(await absent.json()).toEqual({
        ok: true,
        data: { journalEntryId: null },
      });
      const found = await post(input, "test-token");
      expect(await found.json()).toEqual({
        ok: true,
        data: { journalEntryId: id },
      });
      expect(lookup).toHaveBeenCalledWith(input, {});
      lookup.mockResolvedValueOnce(id).mockResolvedValueOnce(undefined);
      expect(await (await post(invoice, "test-token")).json()).toEqual({
        ok: true,
        data: { journalEntryId: id },
      });
      expect(await (await post(note, "test-token")).json()).toEqual({
        ok: true,
        data: { journalEntryId: null },
      });
      expect(lookup).toHaveBeenCalledWith(invoice, {});
      expect(lookup).toHaveBeenCalledWith(note, {});
      const reversalUrl = url.replace("/journal/lookup", "/reversal/lookup");
      const reversal = {
        orgId: id,
        originalEntryId: id,
        requestKey: id,
        date: "2026-11-23",
        description: "Reversión",
        actorId: id,
      };
      expect((await post(reversal, undefined, reversalUrl)).status).toBe(401);
      expect(
        (
          await post(
            { ...reversal, date: "2026-02-30" },
            "test-token",
            reversalUrl
          )
        ).status
      ).toBe(400);
      expect(lookupReversal).not.toHaveBeenCalled();
      lookupReversal.mockResolvedValueOnce(undefined).mockResolvedValueOnce(id);
      expect(
        await (await post(reversal, "test-token", reversalUrl)).json()
      ).toEqual({
        ok: true,
        data: { reversalEntryId: null },
      });
      expect(
        await (await post(reversal, "test-token", reversalUrl)).json()
      ).toEqual({
        ok: true,
        data: { reversalEntryId: id },
      });
      expect(lookupReversal).toHaveBeenCalledWith(reversal, {});
      const sourceUrl = url.replace(
        "/journal/lookup",
        "/reversal/source/inspect"
      );
      const source = { original: input, reversal };
      expect((await post(source, undefined, sourceUrl)).status).toBe(401);
      expect(
        (
          await post(
            { ...source, original: { ...input, originType: "invoice" } },
            "test-token",
            sourceUrl
          )
        ).status
      ).toBe(400);
      expect(verifySource).not.toHaveBeenCalled();
      verifySource.mockResolvedValueOnce({
        originalEntryId: id,
        reversalEntryId: null,
      });
      expect(
        await (await post(source, "test-token", sourceUrl)).json()
      ).toEqual({
        ok: true,
        data: { originalEntryId: id, reversalEntryId: null },
      });
      expect(verifySource).toHaveBeenCalledWith(source, {});
      const invoiceUrl = url.replace(
        "/journal/lookup",
        "/journal/invoice/inspect"
      );
      expect(
        (await post({ orgId: id, saleId: id }, undefined, invoiceUrl)).status
      ).toBe(401);
      expect(
        (await post({ orgId: id, saleId: "invalid" }, "test-token", invoiceUrl))
          .status
      ).toBe(400);
      expect(inspectInvoice).not.toHaveBeenCalled();
      inspectInvoice
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ journalEntryId: id });
      expect(
        await (
          await post({ orgId: id, saleId: id }, "test-token", invoiceUrl)
        ).json()
      ).toEqual({ ok: true, data: null });
      expect(
        await (
          await post({ orgId: id, saleId: id }, "test-token", invoiceUrl)
        ).json()
      ).toEqual({ ok: true, data: { journalEntryId: id } });
      expect(inspectInvoice).toHaveBeenCalledWith(id, id, {});
      const periodUrl = url.replace(
        "/journal/lookup",
        "/journal/period/inspect"
      );
      expect(
        (await post({ orgId: id, date: "2026-11-23" }, undefined, periodUrl))
          .status
      ).toBe(401);
      expect(
        (await post({ orgId: id, date: "2026-02-30" }, "test-token", periodUrl))
          .status
      ).toBe(400);
      expect(periodQuery).not.toHaveBeenCalled();
      periodQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ status: "OPEN" }] })
        .mockResolvedValueOnce({ rows: [{ status: "CLOSED" }] })
        .mockRejectedValueOnce(new Error("period query unavailable"));
      expect(
        await (
          await post({ orgId: id, date: "2026-11-23" }, "test-token", periodUrl)
        ).json()
      ).toEqual({ ok: true, data: { status: "UNCONFIGURED" } });
      expect(
        await (
          await post({ orgId: id, date: "2026-11-23" }, "test-token", periodUrl)
        ).json()
      ).toEqual({ ok: true, data: { status: "OPEN" } });
      expect(
        await (
          await post({ orgId: id, date: "2026-11-23" }, "test-token", periodUrl)
        ).json()
      ).toEqual({ ok: true, data: { status: "CLOSED" } });
      expect(
        (await post({ orgId: id, date: "2026-11-23" }, "test-token", periodUrl))
          .status
      ).toBe(500);
      const changeUrl = url.replace(
        "/journal/lookup",
        "/journal/period/change"
      );
      const change = {
        orgId: id,
        periodStart: "2026-11-01",
        expectedStatus: "UNCONFIGURED",
        newStatus: "OPEN",
        actorId: id,
        reason: "Apertura inicial",
        requestKey: id,
      };
      expect((await post(change, undefined, changeUrl)).status).toBe(401);
      expect(
        (
          await post(
            { ...change, periodStart: "2026-11-02" },
            "test-token",
            changeUrl
          )
        ).status
      ).toBe(400);
      expect(
        (
          await post(
            { ...change, expectedStatus: "OPEN" },
            "test-token",
            changeUrl
          )
        ).status
      ).toBe(400);
      periodQuery.mockResolvedValueOnce({
        rows: [{ status: "OPEN", idempotent: false }],
      });
      expect(
        await (await post(change, "test-token", changeUrl)).json()
      ).toEqual({
        ok: true,
        data: { status: "OPEN", idempotent: false },
      });
    } finally {
      vi.unstubAllEnvs();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
