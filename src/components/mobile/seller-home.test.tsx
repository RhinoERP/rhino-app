import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SellerMobileHome } from "./seller-home";

describe("seller mobile home", () => {
  it("uses one link per card without a nested interactive button", () => {
    const html = renderToStaticMarkup(
      <SellerMobileHome
        canManageSales
        orgSlug="acme"
        posEnabled={false}
        productionEnabled={false}
        wholesaleEnabled
      />
    );
    expect(html).toContain('href="/org/acme/ventas"');
    expect(html).toContain('href="/org/acme/visitas"');
    expect(html).not.toContain("<button");
    expect(html.match(/<a /g)).toHaveLength(5);
  });
});
