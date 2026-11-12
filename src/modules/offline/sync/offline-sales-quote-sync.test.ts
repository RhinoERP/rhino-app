import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, updateMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("../storage/offline-db", () => ({
  listOfflineSalesQuoteCommands: listMock,
  updateOfflineSalesQuoteCommand: updateMock,
}));

import {
  retryOfflineSalesQuoteCommand,
  syncOfflineSalesQuotes,
} from "./offline-sales-quote-sync";

const commandId = "00000000-0000-4000-8000-000000000001";
const ownerUserId = "00000000-0000-4000-8000-000000000002";
const record = {
  command: { commandId, ownerUserId },
  status: "queued",
  attempts: 0,
  updatedAt: "2026-11-11T00:00:00.000Z",
};

describe("offline sales quote sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { onLine: true, locks: undefined });
    vi.stubGlobal("fetch", vi.fn());
    listMock.mockResolvedValue([record]);
    updateMock.mockImplementation(async (_id, update) => update(record));
  });

  it("stores the approved request id and expiry/cost warnings from the server", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        requestId: "00000000-0000-4000-8000-000000000003",
        snapshotExpired: true,
        historicalCostMissing: true,
      })
    );

    await syncOfflineSalesQuotes(ownerUserId);

    expect(updateMock).toHaveBeenLastCalledWith(
      commandId,
      expect.any(Function)
    );
    expect(updateMock).toHaveBeenCalledTimes(2);
    const finalUpdate = updateMock.mock.calls[1]?.[1];
    expect(finalUpdate({ ...record, status: "syncing" })).toMatchObject({
      status: "synced",
      snapshotExpired: true,
      historicalCostMissing: true,
    });
  });

  it("moves permanent responses to review and exposes manual retry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ message: "La referencia cambió" }, { status: 409 })
    );

    await syncOfflineSalesQuotes(ownerUserId);

    const failureUpdate = updateMock.mock.calls[1]?.[1];
    expect(failureUpdate({ ...record, status: "syncing" })).toMatchObject({
      status: "requires-review",
      lastError: "La referencia cambió",
    });

    listMock.mockResolvedValueOnce([{ ...record, status: "requires-review" }]);
    listMock.mockResolvedValueOnce([]);
    await expect(
      retryOfflineSalesQuoteCommand(commandId, ownerUserId)
    ).resolves.toBe(true);
  });
});
