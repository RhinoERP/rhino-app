import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getInformalEntryByIdMock = vi.fn();
const cancelInformalEntryMock = vi.fn();
const asentarInformalEntryMock = vi.fn();
const formalizarInformalEntryMock = vi.fn();

vi.mock("../modules/journal/informal-entries.service", () => ({
  getInformalEntryById: getInformalEntryByIdMock,
  cancelInformalEntry: cancelInformalEntryMock,
  asentarInformalEntry: asentarInformalEntryMock,
  formalizarInformalEntry: formalizarInformalEntryMock,
  callCreateInformalEntry: vi.fn(),
  listInformalEntries: vi.fn(),
}));

vi.mock("../modules/accounts/accounts.queries", () => ({
  resolveAccountCode: vi.fn(),
}));

vi.mock("../modules/chart/rules.engine", () => ({
  resolveEvent: vi.fn(),
}));

async function createTestServer() {
  const { default: router } = await import("./informal-entries.routes");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(
    (
      err: { message?: string; status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ ok: false, error: err.message ?? "Error" });
    }
  );

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

describe("informal entries routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza cancelar sin org_id", async () => {
    const server = await createTestServer();

    try {
      const response = await fetch(
        `${server.baseUrl}/informal-entries/entry-1/cancelar`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(400);
      expect(cancelInformalEntryMock).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("propaga org_id a cancelar y a la lectura puntual", async () => {
    cancelInformalEntryMock.mockResolvedValue(undefined);
    getInformalEntryByIdMock.mockResolvedValue({
      id: "entry-1",
      org_id: "org-1",
      lineas: [],
    });

    const server = await createTestServer();

    try {
      const cancelResponse = await fetch(
        `${server.baseUrl}/informal-entries/entry-1/cancelar?org_id=org-1`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      expect(cancelResponse.status).toBe(200);
      expect(cancelInformalEntryMock).toHaveBeenCalledWith("entry-1", "org-1");

      const detailResponse = await fetch(
        `${server.baseUrl}/informal-entries/entry-1?org_id=org-1`
      );
      expect(detailResponse.status).toBe(200);
      expect(getInformalEntryByIdMock).toHaveBeenCalledWith("entry-1", "org-1");
    } finally {
      await server.close();
    }
  });
});
