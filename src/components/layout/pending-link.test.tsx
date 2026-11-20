import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PendingLink } from "./pending-link";

const status = vi.hoisted(() => ({ pending: false }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => status,
}));

describe("PendingLink", () => {
  it("shows immediate navigation feedback until the next page is ready", () => {
    status.pending = true;
    const html = renderToStaticMarkup(
      <PendingLink href="/org/acme/visitas">Visitas</PendingLink>
    );
    expect(html).toContain("Abriendo…");
    expect(html).toContain("Cargando");
    status.pending = false;
    expect(
      renderToStaticMarkup(
        <PendingLink href="/org/acme/visitas">Visitas</PendingLink>
      )
    ).not.toContain("Abriendo…");
  });
});
