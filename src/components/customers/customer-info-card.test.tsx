import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Customer } from "@/modules/customers/types";
import { CustomerInfoCard } from "./customer-info-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/customers/add-customer-dialog", () => ({
  AddCustomerDialog: () => null,
}));
vi.mock("@/components/collections/pre-sale-customer-account", () => ({
  CustomerOpenReceivablesSection: () => (
    <div>Facturas pendientes de prueba</div>
  ),
}));

function render(phone: string | null) {
  return renderToStaticMarkup(
    <CustomerInfoCard
      createdAt="—"
      customer={
        {
          id: "customer-id",
          business_name: "Cliente de prueba",
          phone,
        } as Customer
      }
      mapsLink={null}
      orgSlug="org-qa"
      updatedAt={null}
    />
  );
}

describe("customer contact actions", () => {
  it("includes current-account debts in the customer information card", () => {
    const html = render(null);
    expect(html).toContain("Deudas de cuenta corriente");
    expect(html).toContain("Facturas pendientes de prueba");
  });
  it("shows a call action and WhatsApp when a number is available", () => {
    const html = render("+54 (11) 1234-5678");
    expect(html).toContain('href="tel:+541112345678"');
    expect(html).toContain('href="https://wa.me/541112345678"');
  });

  it("does not render broken contact links for an empty number", () => {
    const html = render(null);
    expect(html).toContain("Teléfono no informado");
    expect(html).not.toContain('href="tel:');
    expect(html).not.toContain("wa.me/");
  });
});
