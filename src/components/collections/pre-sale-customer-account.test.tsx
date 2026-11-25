import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerOpenReceivablesSection } from "./pre-sale-customer-account";

const query = vi.hoisted(() => ({
  data: [
    {
      id: "account-a",
      invoiceNumber: "Factura de prueba",
      saleNumber: 1,
      saleDate: "2026-11-01",
      dueDate: "2026-11-01",
      currency: "ARS",
      totalAmount: 120,
      pendingBalance: 20,
    },
  ],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: query.data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock(
  "@/modules/collections/actions/get-customer-open-receivables.action",
  () => ({
    getCustomerOpenReceivablesAction: vi.fn(),
  })
);

function render(canReadCollections: boolean) {
  return renderToStaticMarkup(
    <CustomerOpenReceivablesSection
      canReadCollections={canReadCollections}
      compact
      customerId="customer-a"
      orgSlug="org-qa"
    />
  );
}

describe("customer current-account section", () => {
  it("displays only the authorized pending-account data", () => {
    const html = render(true);
    expect(html).toContain("Pendiente (ARS)");
    expect(html).toContain("Vencido");
    expect(html).toContain("Factura de prueba");
    expect(html).toContain("Exportar facturas pendientes (CSV)");
  });

  it("does not display debt when collections access is unavailable", () => {
    const html = render(false);
    expect(html).toContain("No tenés permiso");
    expect(html).not.toContain("Factura de prueba");
    expect(html).not.toContain("Exportar facturas pendientes");
  });
});
