import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeliConfirmationError } from "../errors";
import {
  createMeliPhysicalReturnAction,
  getMeliPhysicalReturnFormAction,
} from "./meli-physical-return.action";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  form: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../service/meli-physical-return.service", () => ({
  createMeliPhysicalReturn: mocks.create,
  getMeliPhysicalReturnForm: mocks.form,
  listMeliPhysicalReturns: vi.fn(),
  MeliPhysicalReturnError: class extends Error {},
}));

describe("physical-return actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockResolvedValue({
      returnId: "receipt",
      saleId: "sale",
      idempotent: false,
    });
  });
  it("refreshes stock and the source sale after a confirmed physical receipt", async () => {
    expect((await createMeliPhysicalReturnAction("org", {})).success).toBe(
      true
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/org/org/stock");
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/org/org/venta-directa/mercado-libre/sale"
    );
  });
  it("preserves a confirmed receipt when cache invalidation fails after the commit", async () => {
    mocks.revalidate.mockImplementation(() => {
      throw new Error("cache unavailable");
    });
    expect(await createMeliPhysicalReturnAction("org", {})).toMatchObject({
      success: true,
      data: { returnId: "receipt" },
      refreshRequired: true,
    });
  });
  it("returns known rollback editability while preserving uncertainty", async () => {
    mocks.create.mockRejectedValueOnce(
      new MeliConfirmationError("Cantidad inválida", true)
    );
    expect(await createMeliPhysicalReturnAction("org", {})).toMatchObject({
      success: false,
      canEdit: true,
    });
    mocks.create.mockRejectedValueOnce(
      new MeliConfirmationError("Sin respuesta", false)
    );
    expect(await createMeliPhysicalReturnAction("org", {})).toMatchObject({
      success: false,
      canEdit: false,
    });
  });
  it("reports a revoked permission without turning an unavailable form into empty stock", async () => {
    mocks.form.mockRejectedValue(new Error("Sin acceso al depósito"));
    expect(await getMeliPhysicalReturnFormAction("org", "sale")).toMatchObject({
      success: false,
      error: "Sin acceso al depósito",
    });
  });
});
