import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn().mockResolvedValue({ id: "org" }),
}));

import { getSupplierInvoices } from "./supplier-invoices.service";

it("retains a link ID when purchase-order RLS hides the joined order", async () => {
  const orderId = "00000000-0000-4000-8000-000000000001";
  const rows = [
    {
      invoice_type: "A",
      payable_model: "INVOICE",
      status: "REGISTERED",
      order_links: [{ purchase_order_id: orderId, purchase_order: null }],
    },
  ];
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order
    .mockReturnValueOnce(query)
    .mockResolvedValueOnce({ data: rows, error: null });
  mocks.client.mockResolvedValue({
    from: vi.fn().mockReturnValue(query),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: ["purchases.read.all"] }),
  });

  const invoices = await getSupplierInvoices("demo");
  expect(invoices[0].purchase_orders).toEqual([
    { id: orderId, purchase_number: null },
  ]);
  expect(query.select).toHaveBeenCalledWith(
    expect.stringContaining("purchase_order_id, purchase_order:")
  );
});
