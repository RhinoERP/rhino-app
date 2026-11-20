import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchableCatalogPicker } from "./searchable-catalog-picker";

const options = [{ value: "one", label: "Cliente vigente" }];

function render(value: string) {
  return renderToStaticMarkup(
    <SearchableCatalogPicker
      label="Cliente"
      onChange={vi.fn()}
      options={options}
      placeholder="Buscar cliente"
      searchPlaceholder="Buscar por nombre"
      value={value}
    />
  );
}

describe("searchable catalog picker", () => {
  it("shows selected option on the trigger", () => {
    expect(render("one")).toContain("Cliente vigente");
    expect(render("one")).not.toContain('aria-invalid="true"');
  });

  it("warns when a saved selection no longer exists", () => {
    const html = render("removed");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("La opción anterior ya no está disponible");
    expect(html).not.toContain("Cliente vigente");
  });
});
