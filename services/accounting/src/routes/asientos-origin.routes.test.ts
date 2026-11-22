import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it, vi } from "vitest";

const listJournalEntriesByOrigin = vi.fn();

vi.mock("../modules/journal/journal.service", () => ({
  findActiveJournalEntryIdByReference: vi.fn(),
  getJournalEntryById: vi.fn(),
  listJournalEntriesByOrigin,
}));

async function createTestServer() {
  const { default: router } = await import("./asientos.routes");
  const app = express();
  app.use(router);
  app.use(
    (
      error: { message?: string; status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(error.status ?? 500).json({ error: error.message });
    }
  );
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("journal entries by origin", () => {
  it("returns all originals and reversals from the scoped query", async () => {
    const orgId = "00000000-0000-4000-8000-000000000001";
    const originId = "00000000-0000-4000-8000-000000000002";
    const entries = [
      { id: "original-1", tipo_evento: "MELI_COBRO" },
      { id: "original-2", tipo_evento: "MELI_COBRO" },
      { id: "reversal-1", tipo_evento: "CONTRA_ASIENTO" },
    ];
    listJournalEntriesByOrigin.mockResolvedValueOnce(entries);
    const server = await createTestServer();
    try {
      const query = new URLSearchParams({
        org_id: orgId,
        referencia_id: originId,
        referencia_tabla: "mercadolibre_payments",
      });
      const response = await fetch(`${server.url}/by-origin?${query}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, data: entries });
      expect(listJournalEntriesByOrigin).toHaveBeenCalledWith({
        orgId,
        referenciaId: originId,
        referenciaTabla: "mercadolibre_payments",
      });
    } finally {
      await server.close();
    }
  });

  it("rejects invalid scope before consulting the database", async () => {
    listJournalEntriesByOrigin.mockClear();
    const server = await createTestServer();
    try {
      const query = new URLSearchParams({
        org_id: "00000000-0000-4000-8000-000000000001",
        referencia_id: "00000000-0000-4000-8000-000000000002",
        referencia_tabla: "unknown",
      });
      const response = await fetch(`${server.url}/by-origin?${query}`);
      expect(response.status).toBe(400);
      expect(listJournalEntriesByOrigin).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
