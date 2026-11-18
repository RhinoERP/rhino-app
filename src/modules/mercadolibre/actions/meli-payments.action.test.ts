import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeliConfirmationError } from "../errors";
import {
  createMeliPaymentAction,
  voidMeliPaymentAction,
} from "./meli-payments.action";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  void: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("../service/meli-payments.service", () => ({
  createMeliPayment: mocks.create,
  voidMeliPayment: mocks.void,
}));
describe("Meli collection actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockResolvedValue({
      saleId: "sale",
      payment_id: "payment",
      payment_status: "RECORDED",
    });
    mocks.void.mockResolvedValue({
      saleId: "sale",
      payment_id: "payment",
      payment_status: "VOIDED",
    });
  });
  it("refreshes the collection section and original Meli sale after registration", async () => {
    expect((await createMeliPaymentAction("org", {})).success).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledWith("/org/org/cobranzas", "layout");
    expect(mocks.refresh).toHaveBeenCalledWith(
      "/org/org/venta-directa/mercado-libre/sale"
    );
  });
  it("keeps a confirmed collection successful if view invalidation fails", async () => {
    mocks.refresh.mockImplementation(() => {
      throw new Error("cache");
    });
    expect(await createMeliPaymentAction("org", {})).toMatchObject({
      success: true,
      refreshRequired: true,
    });
  });
  it("does not unlock uncertain writes as editable new collections", async () => {
    mocks.create.mockRejectedValueOnce(
      new MeliConfirmationError("Sin respuesta", false)
    );
    expect(await createMeliPaymentAction("org", {})).toMatchObject({
      success: false,
      canEdit: false,
    });
    mocks.create.mockRejectedValueOnce(
      new MeliConfirmationError("Importe inválido", true)
    );
    expect(await createMeliPaymentAction("org", {})).toMatchObject({
      success: false,
      canEdit: true,
    });
  });
  it("invalidates views for an audit-preserving void without calling registration", async () => {
    expect((await voidMeliPaymentAction("org", {})).success).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.void).toHaveBeenCalledTimes(1);
  });
});
