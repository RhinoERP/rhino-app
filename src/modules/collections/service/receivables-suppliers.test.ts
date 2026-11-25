import { beforeEach, describe, expect, it, vi } from "vitest";
import { receivableSupplierLabel } from "../utils/receivable-suppliers";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  getOrganizationMembersWithUsersAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));
vi.mock("@/modules/organizations/service/members.service", () => ({
  getOrganizationMembersWithUsersAdmin:
    mocks.getOrganizationMembersWithUsersAdmin,
}));

import { getReceivablesPaginated } from "./collections.service";

const rows = ["sale-1", "sale-2", "sale-3"].map((saleId, index) => ({
  id: `account-${index + 1}`,
  organization_id: "org-1",
  customer_id: `customer-${index + 1}`,
  sales_order_id: saleId,
  manual_fiscal_invoice_id: null,
  total_amount: 100,
  pending_balance: 100,
  currency: "ARS",
  due_date: `2026-11-0${index + 1}`,
  created_at: "2026-10-01",
  customer: {
    id: `customer-${index + 1}`,
    business_name: `Cliente ${index + 1}`,
    fantasy_name: null,
  },
  sale: {
    status: "DELIVERED",
    user_id: null,
    supplier_id: null,
    invoice_number: `F-${index + 1}`,
    dispatched_at: null,
    remittance_number: null,
  },
  manual_invoice: null,
}));

const saleItems = [
  { sale: "sale-1", supplierId: "supplier-a", supplierName: "A" },
  { sale: "sale-2", supplierId: "supplier-a", supplierName: "A" },
  { sale: "sale-2", supplierId: "supplier-b", supplierName: "B" },
  { sale: "sale-3", supplierId: "supplier-b", supplierName: "B" },
].map(({ sale, supplierId, supplierName }, index) => ({
  id: `item-${index + 1}`,
  sales_order_id: sale,
  product_id: `product-${index + 1}`,
  quantity: 1,
  unit_quantity: 1,
  subtotal: 100,
  product: {
    id: `product-${index + 1}`,
    name: `Producto ${index + 1}`,
    unit_of_measure: "UN",
    supplier_id: supplierId,
    supplier: { id: supplierId, name: supplierName },
  },
}));

describe("proveedores de cuentas por cobrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationBySlug.mockResolvedValue({ id: "org-1" });
    mocks.getOrganizationMembersWithUsersAdmin.mockResolvedValue([]);
  });

  it("incluye ventas mixtas al filtrar y pagina después de filtrar", async () => {
    const supplierQueries: Record<string, string[]>[] = [];
    const supabase = {
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
      rpc: vi
        .fn()
        .mockResolvedValue({ data: ["collections.read.all"], error: null }),
      from(table: string) {
        const filters: Record<string, string[]> = {};
        let selection = "";
        const query = {
          select(value: string) {
            selection = value;
            return query;
          },
          eq() {
            return query;
          },
          in(field: string, values: string[]) {
            filters[field] = values;
            return query;
          },
          order() {
            return query;
          },
          range(from: number, to: number) {
            if (table === "accounts_receivable") {
              return Promise.resolve({
                data: rows.slice(from, to + 1),
                error: null,
              });
            }
            supplierQueries.push(filters);
            const matching = saleItems.filter(
              (item) =>
                filters.sales_order_id?.includes(item.sales_order_id) &&
                filters["product.supplier_id"]?.includes(
                  item.product.supplier_id
                )
            );
            return Promise.resolve({
              data: matching.slice(from, to + 1),
              error: null,
            });
          },
          // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
          then(resolve: (value: unknown) => void) {
            let data: unknown[] = [];
            if (table === "accounts_receivable" && selection.includes("*")) {
              data = rows.filter((row) => filters.id?.includes(row.id));
            } else if (table === "sales_order_items") {
              data = saleItems.filter((item) =>
                filters.sales_order_id?.includes(item.sales_order_id)
              );
            }
            resolve({ data, error: null });
          },
        };
        return query;
      },
    };
    mocks.createClient.mockResolvedValue(supabase);

    const first = await getReceivablesPaginated("org", {
      page: 1,
      pageSize: 1,
      supplierIds: ["supplier-b"],
    });
    const second = await getReceivablesPaginated("org", {
      page: 2,
      pageSize: 1,
      supplierIds: ["supplier-b"],
    });

    expect(supplierQueries[0]?.["product.supplier_id"]).toEqual(["supplier-b"]);
    expect(first.totalCount).toBe(2);
    expect(first.data.map((account) => account.id)).toEqual(["account-2"]);
    expect(first.data[0].suppliers?.map((supplier) => supplier.id)).toEqual([
      "supplier-a",
      "supplier-b",
    ]);
    expect(receivableSupplierLabel(first.data[0].suppliers)).toBe("Varios");
    expect(second.totalCount).toBe(2);
    expect(second.data.map((account) => account.id)).toEqual(["account-3"]);
    expect(receivableSupplierLabel(second.data[0].suppliers)).toBe("B");
    expect(receivableSupplierLabel([])).toBe("—");
  });
});
