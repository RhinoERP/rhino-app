import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeliConfirmationError } from "../errors";
import { saveMeliAccountingDraftAction } from "./meli-accounting-drafts.action";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("../service/meli-accounting-drafts.service", () => ({
  saveMeliAccountingDraft: mocks.save,
}));

describe("Meli accounting draft action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.save.mockResolvedValue({
      draft_id: "draft",
      version: 1,
      idempotent: false,
    });
  });

  it("refreshes collections after a successful save", async () => {
    expect(await saveMeliAccountingDraftAction("org", {})).toMatchObject({
      success: true,
      refreshRequired: false,
    });
    expect(mocks.refresh).toHaveBeenCalledWith("/org/org/cobranzas", "layout");
  });

  it("preserves confirmation even when cache invalidation fails", async () => {
    mocks.refresh.mockImplementation(() => {
      throw new Error("cache");
    });
    expect(await saveMeliAccountingDraftAction("org", {})).toMatchObject({
      success: true,
      refreshRequired: true,
    });
  });

  it("does not unlock an unconfirmed attempt", async () => {
    mocks.save.mockRejectedValue(
      new MeliConfirmationError("Respuesta incierta", false)
    );
    expect(await saveMeliAccountingDraftAction("org", {})).toMatchObject({
      success: false,
      canEdit: false,
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
