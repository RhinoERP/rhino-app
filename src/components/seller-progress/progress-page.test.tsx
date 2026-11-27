import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyKpis } from "@/modules/seller-progress/progress";
import type { SellerProgressSnapshot } from "@/modules/seller-progress/progress.service";
import { ProgressPage } from "./progress-page";

vi.mock("@/modules/seller-progress/progress.actions", () => ({
  saveProgressGoalAction: vi.fn(),
}));

const snapshot: SellerProgressSnapshot = {
  month: "2026-11-01",
  currentMonth: "2026-11-01",
  isAdmin: true,
  goalsAvailable: true,
  rows: [
    {
      sellerId: "seller-1",
      sellerName: "Ana",
      actual: {
        ...emptyKpis(),
        billing: 2500,
        units: 2,
        kg: 7,
        lt: 3,
        boxes: 1,
        newCustomers: 2,
        visits: 3,
        sales: 4,
      },
      targets: emptyKpis(),
    },
  ],
};

describe("KPI de progreso", () => {
  it("muestra los cinco KPI y objetivos editables para el administrador", () => {
    const html = renderToStaticMarkup(
      <ProgressPage orgSlug="acme" snapshot={snapshot} />
    );
    for (const label of [
      "Facturación ($)",
      "Cantidad vendida",
      "Clientes nuevos",
      "Visitas realizadas",
      "Cantidad de ventas",
      "Kilogramos",
      "Litros",
      "Bultos (cajas)",
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/type="number"/g)).toHaveLength(8);
    expect(html).not.toContain("Mantener la base");
    expect(html).not.toContain("Recuperar");
  });

  it("oculta la edición de objetivos al vendedor", () => {
    const html = renderToStaticMarkup(
      <ProgressPage orgSlug="acme" snapshot={{ ...snapshot, isAdmin: false }} />
    );
    expect(html).toContain("Mi progreso");
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain("Guardar objetivos");
  });
});
