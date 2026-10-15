import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredOfflineCommand } from "../contracts/offline-command-record";

const storage = vi.hoisted(() => ({
  claimOfflineCommand: vi.fn(),
  deleteOfflinePreSaleDraft: vi.fn(),
  finalizeOfflineCommandClaim: vi.fn(),
  listOfflineCommands: vi.fn(),
}));
const events = vi.hoisted(() => ({
  publishOfflineCommandStatus: vi.fn(),
  publishOfflinePreSaleSynced: vi.fn(),
}));

vi.mock("../storage/offline-db", () => storage);
vi.mock("./offline-sync-events", () => events);

import {
  getNextAttemptAt,
  replayOfflineCommands,
} from "./offline-command-sync";

const ids = {
  command: "00000000-0000-4000-8000-000000000001",
  owner: "00000000-0000-4000-8000-000000000002",
  organization: "00000000-0000-4000-8000-000000000003",
  draft: "00000000-0000-4000-8000-000000000004",
  snapshot: "00000000-0000-4000-8000-000000000005",
  customer: "00000000-0000-4000-8000-000000000006",
  line: "00000000-0000-4000-8000-000000000007",
  product: "00000000-0000-4000-8000-000000000008",
  resource: "00000000-0000-4000-8000-000000000009",
};

const record = {
  commandId: ids.command,
  draftId: ids.draft,
  ownerUserId: ids.owner,
  organizationId: ids.organization,
  status: "queued",
  attemptCount: 0,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
  lastAttemptAt: null,
  nextAttemptAt: null,
  leaseOwnerId: null,
  leaseExpiresAt: null,
  resourceId: null,
  lastError: null,
  command: {
    commandId: ids.command,
    schemaVersion: 1,
    type: "preSale.create",
    ownerUserId: ids.owner,
    organizationId: ids.organization,
    orgSlugAtCreation: "one",
    snapshotId: ids.snapshot,
    createdAt: "2026-09-21T12:00:00.000Z",
    payload: {
      customerId: ids.customer,
      sellerId: ids.owner,
      saleDate: "2026-09-21",
      paymentMethod: "efectivo",
      invoiceType: "NOTA_DE_VENTA",
      observations: "",
      items: [
        {
          lineId: ids.line,
          productId: ids.product,
          quantity: 1,
          unitPrice: 10,
          taxes: [],
        },
      ],
    },
  },
} satisfies StoredOfflineCommand;

const response = (duplicate = false) =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        ok: true,
        commandId: ids.command,
        resourceId: ids.resource,
        duplicate,
      }),
  });

describe("offline command replay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storage.listOfflineCommands.mockReset().mockResolvedValue([record]);
    storage.claimOfflineCommand.mockReset().mockResolvedValue({
      ...record,
      status: "syncing",
      attemptCount: 1,
      leaseOwnerId: ids.resource,
    });
    storage.finalizeOfflineCommandClaim
      .mockReset()
      .mockImplementation(async (_id, _lease, update) => update(record));
    storage.deleteOfflinePreSaleDraft.mockReset().mockResolvedValue(undefined);
    events.publishOfflineCommandStatus.mockReset();
    events.publishOfflinePreSaleSynced.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response())
    );
    vi.stubGlobal("navigator", {});
  });

  it.each([
    false,
    true,
  ])("finalizes and publishes successful responses (duplicate=%s)", async (duplicate) => {
    vi.mocked(fetch).mockImplementationOnce(() => response(duplicate) as never);

    const result = await replayOfflineCommands(ids.owner);

    expect(result[0]?.status).toBe("synced");
    expect(storage.deleteOfflinePreSaleDraft).toHaveBeenCalledWith(
      ids.draft,
      ids.owner,
      ids.organization
    );
    expect(events.publishOfflinePreSaleSynced).toHaveBeenCalledOnce();
  });

  it("lists all organizations for the authenticated owner without a snapshot", async () => {
    storage.listOfflineCommands.mockResolvedValueOnce([]);

    await replayOfflineCommands(ids.owner);

    expect(storage.listOfflineCommands).toHaveBeenCalledWith(ids.owner);
  });

  it("does not claim syncing records before their lease expires", async () => {
    storage.listOfflineCommands.mockResolvedValueOnce([
      {
        ...record,
        status: "syncing",
        leaseExpiresAt: "2999-01-01T00:00:00.000Z",
      },
    ]);

    expect(await replayOfflineCommands(ids.owner)).toEqual([]);
    expect(storage.claimOfflineCommand).not.toHaveBeenCalled();
  });

  it("uses one same-context flight for concurrent calls", async () => {
    let release: ((records: StoredOfflineCommand[]) => void) | undefined;
    storage.listOfflineCommands.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const first = replayOfflineCommands(ids.owner);
    const second = replayOfflineCommands(ids.owner);
    expect(second).toBe(first);
    release?.([]);
    await first;
    expect(storage.listOfflineCommands).toHaveBeenCalledOnce();
  });

  it("runs a targeted replay after an unrelated owner-wide flight", async () => {
    let release: ((records: StoredOfflineCommand[]) => void) | undefined;
    storage.listOfflineCommands
      .mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        })
      )
      .mockResolvedValueOnce([record]);

    const background = replayOfflineCommands(ids.owner);
    const targeted = replayOfflineCommands(ids.owner, ids.command, true);
    release?.([]);

    await background;
    const result = await targeted;
    expect(result[0]?.commandId).toBe(ids.command);
    expect(storage.listOfflineCommands).toHaveBeenCalledTimes(2);
  });

  it("partitions Web Locks by owner", async () => {
    storage.listOfflineCommands.mockResolvedValue([]);
    const request = vi.fn(async (_name: string, callback: () => unknown) =>
      callback()
    );
    vi.stubGlobal("navigator", { locks: { request } });

    await replayOfflineCommands(ids.owner);

    expect(request).toHaveBeenCalledWith(
      `rhinos-offline-command-replay:${ids.owner}`,
      expect.any(Function)
    );
  });

  it("does not clean up or publish success when finalization loses ownership", async () => {
    storage.finalizeOfflineCommandClaim.mockResolvedValueOnce(null);

    expect(await replayOfflineCommands(ids.owner)).toEqual([]);
    expect(storage.deleteOfflinePreSaleDraft).not.toHaveBeenCalled();
    expect(events.publishOfflinePreSaleSynced).not.toHaveBeenCalled();
  });

  it("aborts timed out fetches and releases the claim as queued", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        }) as never
    );

    const replay = replayOfflineCommands(ids.owner);
    await vi.advanceTimersByTimeAsync(15_000);
    const [result] = await replay;

    expect(result?.status).toBe("queued");
    expect(storage.finalizeOfflineCommandClaim).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("bounds exponential jitter and permits deterministic time and randomness", () => {
    const now = Date.parse("2026-09-21T12:00:00.000Z");
    expect(Date.parse(getNextAttemptAt(20, now, () => 1)) - now).toBe(300_000);
    expect(Date.parse(getNextAttemptAt(1, now, () => 0)) - now).toBe(2500);
  });
});
