import { NextResponse } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  guard: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthResponse: mocks.auth }));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationPermissionAccess: mocks.guard,
}));
vi.mock("@/modules/price-lists/service/price-lists.service", () => ({
  updatePriceListPrices: mocks.update,
}));
const item = "10000000-0000-4000-8000-000000000001";
const params = {
  params: Promise.resolve({ orgSlug: "test", priceListId: "list" }),
};
const request = (body: unknown) =>
  new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue(null);
  mocks.guard.mockReset().mockResolvedValue(undefined);
  mocks.update.mockReset().mockResolvedValue(1);
});
it("rechaza una sesión ausente antes de invocar servicios", async () => {
  mocks.auth.mockResolvedValue(
    NextResponse.json({ error: "No autorizado" }, { status: 401 })
  );
  expect(
    (await POST(request({ item_ids: [item], price: 200 }), params)).status
  ).toBe(401);
  expect(mocks.guard).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
it("propaga el guard de permisos sin convertir una redirección en éxito o error de negocio", async () => {
  mocks.guard.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(
    POST(request({ item_ids: [item], price: 200 }), params)
  ).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.guard).toHaveBeenCalledWith("test", "pricelists.manage");
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each([
  { item_ids: [item], price: 10, percentage: 5 },
  { item_ids: [item, item], price: 10 },
  { item_ids: ["invalid"], price: 10 },
  { item_ids: [item], percentage: -100 },
])("bloquea datos inválidos antes de escribir: %j", async (body) => {
  expect((await POST(request(body), params)).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("envía una sola operación masiva y devuelve el número realmente actualizado", async () => {
  const response = await POST(
    request({ item_ids: [item], amount_delta: 25 }),
    params
  );
  expect(await response.json()).toEqual({ success: true, updated_count: 1 });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
    orgSlug: "test",
    priceListId: "list",
    item_ids: [item],
    amount_delta: 25,
  });
});
