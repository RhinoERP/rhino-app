import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Organization } from "@/modules/organizations/types";
import { MobileOrganizationSwitcher } from "./mobile-organization-switcher";

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: (props: { "aria-label": string }) => <button {...props} />,
}));

describe("mobile header", () => {
  it("exposes the side menu next to organization and account", () => {
    const org = {
      id: "org",
      slug: "demo",
      name: "Organización de prueba",
    } as Organization;
    const html = renderToStaticMarkup(
      <MobileOrganizationSwitcher
        currentOrganization={org}
        organizations={[org]}
      />
    );
    expect(html).toContain('aria-label="Abrir menú de accesos"');
    expect(html).toContain('aria-label="Cuenta"');
  });
});
