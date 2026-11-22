import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMeliFiscalAccountingSnapshotAction,
  listMeliFiscalJournalEntriesAction,
} from "./meli-fiscal-accounting-history.action";

const mocks = vi.hoisted(() => ({ list: vi.fn(), snapshot: vi.fn() }));
vi.mock("../service/meli-fiscal-accounting-history.service", () => ({
  listMeliFiscalJournalEntries: mocks.list,
  getMeliFiscalAccountingSnapshot: mocks.snapshot,
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
});
