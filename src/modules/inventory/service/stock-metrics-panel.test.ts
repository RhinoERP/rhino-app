import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockMetricsPanel } from "@/components/stock/stock-metrics-panel";

const mocks = vi.hoisted(() => ({ query: vi.fn(), cards: vi.fn() }));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: mocks.query,
}));
vi.mock("@/components/stock/stock-metrics", () => ({
  StockMetricsCards: mocks.cards,
}));
const renderPanel = () =>
  renderToStaticMarkup(
    createElement(StockMetricsPanel, { orgSlug: "org", accessKey: "user" })
  );

describe("independent stock metrics panel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cards.mockReturnValue(null);
  });

  it("shows its own loading state without requiring page-level blocking", () => {
    mocks.query.mockReturnValue({ isPending: true });
    expect(renderPanel()).toContain("Cargando indicadores de stock");
    expect(mocks.cards).not.toHaveBeenCalled();
  });

  it("shows a local retry after a failure and does not display cached restricted/stale values", () => {
    mocks.query.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error("No se pudieron cargar los indicadores"),
      data: { totalStockValue: 999_999 },
    });
    const markup = renderPanel();
    expect(markup).toContain("Reintentar indicadores");
    expect(markup).toContain("No se pudieron cargar");
    expect(mocks.cards).not.toHaveBeenCalled();
  });

  it("renders the full-scope response with an explicit refresh control", () => {
    const data = { totalProducts: 3000, totalUnits: 12_000 };
    mocks.query.mockReturnValue({
      isPending: false,
      isError: false,
      isFetching: false,
      data,
    });
    expect(renderPanel()).toContain("Actualizar indicadores");
    expect(mocks.cards.mock.calls[0][0].metrics).toEqual(data);
  });
});
