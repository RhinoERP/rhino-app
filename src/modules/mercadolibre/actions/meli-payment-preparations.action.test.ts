import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeliConfirmationError } from "../errors";
import {
  cancelMeliPaymentPreparationAction,
  prepareMeliPaymentAction,
} from "./meli-payment-preparations.action";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  cancel: vi.fn(),
  inspect: vi.fn(),
  reversals: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("../service/meli-payment-preparations.service", () => ({
  prepareMeliPayment: mocks.prepare,
  cancelMeliPaymentPreparation: mocks.cancel,
  inspectMeliPaymentDispatch: mocks.inspect,
  inspectMeliPaymentReversals: mocks.reversals,
}));

describe("Meli preparation actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prepare.mockResolvedValue({
      preparation_id: "id",
      idempotent: false,
      preparation_status: "PREPARED",
    });
    mocks.cancel.mockResolvedValue({ preparation_id: "id", idempotent: false });
  });

  it("preserves confirmed operations if cache invalidation fails", async () => {
    mocks.refresh.mockImplementation(() => {
      throw new Error("cache");
    });
    expect(await prepareMeliPaymentAction("org", {})).toMatchObject({
      success: true,
      refreshRequired: true,
    });
    expect(await cancelMeliPaymentPreparationAction("org", "id")).toMatchObject(
      {
        success: true,
        refreshRequired: true,
      }
    );
  });

  it("keeps the original key on an uncertain preparation", async () => {
    mocks.prepare.mockRejectedValue(
      new MeliConfirmationError("incierto", false)
    );
    expect(await prepareMeliPaymentAction("org", {})).toMatchObject({
      success: false,
      error: "incierto",
    });

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not claim a new key is safe after a rolled back retry", async () => {
    mocks.prepare.mockRejectedValue(
      new MeliConfirmationError("conflicto", true)
    );
    const result = await prepareMeliPaymentAction("org", {});
    expect(result).toEqual({ success: false, error: "conflicto" });
  });
});
