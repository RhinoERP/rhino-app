import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Organization } from "@/modules/organizations/types";
import { AppSidebar } from "./app-sidebar";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/components/auth/permissions-provider", () => ({
  usePermissions: () => ({
    can: (permission: string) =>
      auth.permissions.includes("organization.admin") ||
      auth.permissions.includes(permission),
  }),
}));
vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
  SidebarHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarTrigger: (props: { "aria-label": string }) => <button {...props} />,
}));
vi.mock("./nav-main", () => ({
  NavMain: ({ categories }: { categories: { items: { url: string }[] }[] }) => (
    <nav>
      {categories.flatMap((category) =>
        category.items.map((item) => (
          <a href={item.url} key={item.url}>
            {item.url}
          </a>
        ))
      )}
    </nav>
  ),
}));
vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));
vi.mock("./app-logo", () => ({
  AppLogo: () => <button aria-label="Cerrar menú de accesos" type="button" />,
}));
vi.mock("./organization-switcher", () => ({
  OrganizationSwitcher: () => null,
}));
vi.mock("./settings-nav-item", () => ({ SettingsNavItem: () => null }));
vi.mock("./user-menu", () => ({ UserMenu: () => null }));

const org = {
  id: "org",
  slug: "demo",
  pos_enabled: true,
  wholesale_enabled: true,
  production_enabled: false,
} as Organization;

function render(permissions: string[], organization = org) {
  auth.permissions = permissions;
  return renderToStaticMarkup(
    <AppSidebar organizations={[organization]} orgSlug="demo" user={null} />
  );
}

describe("mobile access menu", () => {
  it("offers stock and POS through the existing menu only when permitted", () => {
    const html = render(["inventory.read", "pos.manage"]);
    expect(html).toContain('href="/org/demo/stock"');
    expect(html).toContain('href="/org/demo/venta-directa"');
    expect(html).toContain('aria-label="Cerrar menú de accesos"');
  });

  it("does not expose inaccessible destinations", () => {
    const html = render(["sales.manage"]);
    expect(html).not.toContain('href="/org/demo/stock"');
    expect(html).not.toContain('href="/org/demo/venta-directa"');
    expect(
      render(["pos.manage"], { ...org, pos_enabled: false })
    ).not.toContain('href="/org/demo/venta-directa"');
  });
});
