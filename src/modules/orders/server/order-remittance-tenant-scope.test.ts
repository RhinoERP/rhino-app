import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({
    id: "org-a",
    name: "Empresa A",
  })),
}));
vi.mock("./order-remittance-documents.service", () => ({
  findSavedRemittance: vi.fn(async () => null),
  savedRemittanceData: vi.fn(),
}));

import {
  getOrderRemittanceData,
  resolveRemittanceOrderIds,
} from "./order-remittance-pdf-document.service";

describe("historical remittance tenant scope", () => {
  beforeEach(() => vi.clearAllMocks());

  function foreignOrderClient() {
    const filters = new Map<string, unknown>();
    const foreignOrder = {
      id: "order-b",
      quote_id: "quote-b",
      quotes: { customer_id: "customer-b" },
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => {
        filters.set(key, value);
        return query;
      }),
      in: vi.fn(async () => ({
        data: filters.get("organization_id") === "org-a" ? [] : [foreignOrder],
        error: null,
      })),
      single: vi.fn(async () => ({
        data: filters.get("organization_id") === "org-a" ? null : foreignOrder,
        error: null,
      })),
    };
    const from = vi.fn((table: string) => {
      if (table !== "orders") {
        throw new Error(
          "A foreign order must be rejected before reading its content."
        );
      }
      return query;
    });
    mocks.client.mockResolvedValue({ from });
    return { filters, from };
  }

  it("rejects foreign child IDs even when RLS would allow reading both organizations", async () => {
    const { filters, from } = foreignOrderClient();
    await expect(
      getOrderRemittanceData({
        orgSlug: "empresa-a",
        childOrderIds: ["order-b"],
        remitoNumber: "46",
      })
    ).rejects.toThrow("esta organización");
    expect(filters.get("organization_id")).toBe("org-a");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("validates the tenant before resolving historical dispatch groups", async () => {
    const { filters, from } = foreignOrderClient();
    await expect(
      resolveRemittanceOrderIds("order-b", "46", "empresa-a")
    ).rejects.toThrow("esta organización");
    expect(filters.get("organization_id")).toBe("org-a");
    expect(from).not.toHaveBeenCalledWith("order_dispatch_events");
  });
});
