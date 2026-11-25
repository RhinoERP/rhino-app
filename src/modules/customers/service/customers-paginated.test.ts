import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";
import { getCustomersPaginated } from "./customers.service";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: () => query })),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(),
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesAccessContext: vi.fn(),
}));

let result: {
  data: Array<{ id: string }> | null;
  error: { message: string } | null;
  count: number;
};
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  or: vi.fn(() => query),
  order: vi.fn(() => query),
  range: vi.fn(() => Promise.resolve(result)),
};

const params = { page: 1, pageSize: 20, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  result = { data: [{ id: "customer" }], error: null, count: 1 };
  vi.mocked(getOrganizationBySlug).mockResolvedValue({ id: "org" } as never);
  vi.mocked(getSalesAccessContext).mockResolvedValue({
    userId: "seller",
    permissions: ["customers.read", "sales.manage"],
  } as never);
});

describe("paginated customer visibility", () => {
  it("includes assigned and unassigned customers for the seller", async () => {
    expect((await getCustomersPaginated("demo", params)).data).toHaveLength(1);
    expect(query.or).toHaveBeenCalledWith(
      "assigned_seller_id.eq.seller,assigned_seller_id.is.null"
    );
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
    expect(query.range).toHaveBeenCalledWith(0, 19);
  });

  it("does not scope read-all users to a seller", async () => {
    vi.mocked(getSalesAccessContext).mockResolvedValue({
      userId: "seller",
      permissions: ["customers.read.all"],
    } as never);
    await getCustomersPaginated("demo", params);
    expect(query.or).not.toHaveBeenCalled();
  });

  it("reports query errors instead of displaying an empty catalog", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => null);
    result = { data: null, error: { message: "network error" }, count: 0 };
    await expect(getCustomersPaginated("demo", params)).rejects.toThrow(
      "No se pudieron cargar los clientes"
    );
    consoleError.mockRestore();
  });
});
