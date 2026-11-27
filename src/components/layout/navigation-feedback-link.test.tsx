import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavigationFeedbackLink } from "./navigation-feedback-link";

describe("navigation feedback link", () => {
  it("renders a usable native link before hydration", () => {
    const html = renderToStaticMarkup(
      <NavigationFeedbackLink
        href="/org/acme/ventas"
        pendingLabel="Abriendo Ventas…"
      >
        Ventas
      </NavigationFeedbackLink>
    );

    expect(html).toContain('href="/org/acme/ventas"');
    expect(html).toContain("Ventas");
    expect(html).not.toContain("Abriendo Ventas");
  });
});
