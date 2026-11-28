import { beforeEach, expect, it, vi } from "vitest";
import { ORGANIZATION_SETTINGS_DEFAULTS } from "@/modules/organizations/types/organization-settings";
import {
  importPriceList,
  updatePriceListItemDiscounts,
  updatePriceListPrices,
} from "./price-lists.service";

const state = vi.hoisted(() => ({ enabled: false, rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: state.rpc }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("@/modules/organizations/service/org-settings.service", () => ({
  getOrgSettings: async () => ({
    ...ORGANIZATION_SETTINGS_DEFAULTS,
    purchase_discounts_enabled: state.enabled,
  }),
}));

beforeEach(() => {
  state.enabled = false;
  state.rpc.mockReset().mockResolvedValue({
    data: {
      price_list_id: "list",
      imported_count: 1,
      missing_skus: [],
      is_active: false,
    },
    error: null,
  });
});
const input = {
  orgSlug: "test",
  supplier_id: "supplier",
  name: "Lista",
  valid_from: "2027-01-01",
  items: [
    {
      sku: "A",
      price: 100,
      discount_1_percentage: 10,
      discount_2_percentage: 20,
    },
  ],
};

it("usa la importación habitual cuando la función está apagada", async () => {
  await importPriceList(input);
  expect(state.rpc).toHaveBeenCalledWith(
    "import_price_list",
    expect.objectContaining({ p_items: input.items })
  );
});
it("envía precio original, porcentajes y método al RPC atómico de descuentos", async () => {
  state.enabled = true;
  await importPriceList({ ...input, habitual_discount_method: "additive" });
  expect(state.rpc).toHaveBeenCalledWith(
    "import_price_list_with_discounts",
    expect.objectContaining({
      p_habitual_discount_method: "additive",
      p_items: input.items,
    })
  );
});
it("bloquea una suma del 100% antes de crear la lista", async () => {
  state.enabled = true;
  await expect(
    importPriceList({
      ...input,
      habitual_discount_method: "additive",
      items: [{ sku: "A", price: 100, discount_1_percentage: 100 }],
    })
  ).rejects.toThrow("menor al 100%");
  expect(state.rpc).not.toHaveBeenCalled();
});

it("edita descuentos por producto mediante el RPC que bloquea la lista antes de sus ítems", async () => {
  state.enabled = true;
  state.rpc.mockResolvedValue({ data: { id: "item" }, error: null });
  await updatePriceListItemDiscounts({
    orgSlug: "test",
    priceListId: "list",
    itemId: "item",
    listPrice: 100,
    discounts: { discount_1_percentage: 10 },
  });
  expect(state.rpc).toHaveBeenCalledWith(
    "update_price_list_item_discounts_atomic",
    {
      p_org_id: "org",
      p_price_list_id: "list",
      p_item_id: "item",
      p_list_price: 100,
      p_discounts: {
        discount_1_percentage: 10,
        discount_2_percentage: 0,
        discount_3_percentage: 0,
        discount_4_percentage: 0,
        discount_5_percentage: 0,
      },
    }
  );
});

it.each([
  false,
  true,
])("actualiza todos los precios en un solo RPC con la función habilitada=%s", async (enabled) => {
  state.enabled = enabled;
  state.rpc.mockResolvedValue({ data: 2, error: null });
  expect(
    await updatePriceListPrices({
      orgSlug: "test",
      priceListId: "list",
      item_ids: ["a", "b"],
      amount_delta: 10,
    })
  ).toBe(2);
  expect(state.rpc).toHaveBeenCalledOnce();
  expect(state.rpc).toHaveBeenCalledWith(
    "update_price_list_prices_atomic",
    expect.objectContaining({
      p_org_id: "org",
      p_price_list_id: "list",
      p_item_ids: ["a", "b"],
      p_amount_delta: 10,
    })
  );
});
