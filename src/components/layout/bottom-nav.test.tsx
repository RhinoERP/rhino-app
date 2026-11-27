import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./bottom-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/org/acme/visitas" }));

describe("mobile bottom navigation", () => {
  it("includes the visit route for sales managers", () => {
    const html = renderToStaticMarkup(
      <BottomNav canManageSales orgSlug="acme" wholesaleEnabled />
    );
    expect(html).toContain('href="/org/acme/visitas"');
    expect(html).toContain("Visitas");
    expect(html).toContain('href="/org/acme"');
    expect(html).toContain('href="/org/acme/ventas"');
    expect(html).toContain('href="/org/acme/solicitudes-venta"');
    expect(html).toContain('href="/org/acme/clientes"');
    expect(html).toContain('aria-current="page"');
    expect(html.indexOf("Visitas")).toBeLessThan(html.indexOf("Cotizaciones"));
    expect(html).not.toContain('href="/org/acme/stock"');
    expect(html).not.toContain("Salir");
    expect(html.match(/<a /g)).toHaveLength(5);
  });

  it("does not show the visit route without sales management permission", () => {
    const html = renderToStaticMarkup(
      <BottomNav canManageSales={false} orgSlug="acme" wholesaleEnabled />
    );
    expect(html).not.toContain('href="/org/acme/visitas"');
  });
});
