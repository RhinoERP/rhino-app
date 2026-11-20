import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("announces and disables an in-progress action", () => {
    const html = renderToStaticMarkup(
      <Button loading loadingText="Guardando visita…">
        Confirmar visita
      </Button>
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(' disabled=""');
    expect(html).toContain("Guardando visita…");
    expect(html).not.toContain("Confirmar visita");
  });

  it("leaves normal actions available", () => {
    const html = renderToStaticMarkup(<Button>Confirmar visita</Button>);
    expect(html).not.toContain(' disabled=""');
    expect(html).toContain("Confirmar visita");
  });
});
