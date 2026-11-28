import { beforeEach, expect, it, vi } from "vitest";
import { updatePriceListAction } from "./update-price-list.action";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  update: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("../service/price-lists.service", () => ({
  updatePriceList: mocks.update,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({ id: "list" });
});
it("comprueba el permiso de gestión antes de cambiar la cabecera o método", async () => {
  mocks.ensure.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(
    updatePriceListAction({
      orgSlug: "test",
      priceListId: "list",
      habitual_discount_method: "additive",
    })
  ).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.ensure).toHaveBeenCalledWith("pricelists.manage", "test");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("actualiza la lista existente tras autorizar la acción", async () => {
  const input = {
    orgSlug: "test",
    priceListId: "list",
    habitual_discount_method: "additive" as const,
  };
  expect(await updatePriceListAction(input)).toEqual({ success: true });
  expect(mocks.update).toHaveBeenCalledWith(input);
});
