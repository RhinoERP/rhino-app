import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMeliFiscalAccountingSnapshotAction,
  inspectMeliFiscalPostingPeriodAction,
  listMeliFiscalJournalEntriesAction,
} from "./meli-fiscal-accounting-history.action";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  snapshot: vi.fn(),
  period: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("../service/meli-fiscal-accounting-history.service", () => ({
  listMeliFiscalJournalEntries: mocks.list,
  getMeliFiscalAccountingSnapshot: mocks.snapshot,
  inspectMeliFiscalPostingPeriod: mocks.period,
}));

describe("Meli fiscal accounting history action", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the scoped history", async () => {
    mocks.list.mockResolvedValueOnce([{ id: "entry" }]);
    expect(
      await listMeliFiscalJournalEntriesAction("org", { type: "invoice" })
    ).toEqual({ success: true, data: [{ id: "entry" }] });
    expect(mocks.list).toHaveBeenCalledWith("org", { type: "invoice" });
  });

  it("returns an error rather than an empty history on failure", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Sin acceso"));
    expect(await listMeliFiscalJournalEntriesAction("org", {})).toEqual({
      success: false,
      error: "Sin acceso",
    });
  });

  it("returns fiscal snapshot failures without fabricating data", async () => {
    mocks.snapshot.mockRejectedValueOnce(
      new Error("Sin comprobante autorizado")
    );
    expect(await getMeliFiscalAccountingSnapshotAction("org", {})).toEqual({
      success: false,
      error: "Sin comprobante autorizado",
    });
  });

  it("binds period inspection to the current authenticated actor", async () => {
    mocks.period.mockResolvedValueOnce({ date: "2026-11-23", status: "OPEN" });
    mocks.auth.mockResolvedValueOnce({ userId: "actor" });
    expect(await inspectMeliFiscalPostingPeriodAction("org", {})).toEqual({
      success: true,
      data: { date: "2026-11-23", status: "OPEN" },
      actorId: "actor",
    });
  });

  it("does not return an actor when authentication fails", async () => {
    mocks.period.mockResolvedValueOnce({ date: "2026-11-23", status: "OPEN" });
    mocks.auth.mockResolvedValueOnce(null);
    expect(await inspectMeliFiscalPostingPeriodAction("org", {})).toEqual({
      success: false,
      error: "No autorizado.",
    });
  });
});
