import { describe, expect, it } from "vitest";
import {
  aggregate,
  agingBucket,
  applyFilters,
  type FactRow,
  REST_KEY,
} from "./aggregate";
import {
  datasetById,
  defaultSpec,
  type ReportSpec,
  sanitizeSpec,
} from "./catalog";
import { dateBucket, previousRange, resolveRange } from "./periods";
import { REPORT_TEMPLATES } from "./templates";

const ventas = datasetById("ventas");
if (!ventas) {
  throw new Error("falta la fuente ventas");
}

const rows: FactRow[] = [
  {
    fecha: "2026-11-02",
    cliente_id: "c1",
    cliente: "Pendino",
    vendedor: "Ana",
    total: 1000,
  },
  {
    fecha: "2026-11-02",
    cliente_id: "c2",
    cliente: "Almacén Sol",
    vendedor: "Ana",
    total: 500,
  },
  {
    fecha: "2026-11-09",
    cliente_id: "c1",
    cliente: "Pendino",
    vendedor: "Beto",
    total: 300,
  },
  {
    fecha: "2026-10-15",
    cliente_id: "c3",
    cliente: "Kiosco Luz",
    vendedor: null,
    total: 200,
  },
];

const spec = (overrides: Partial<ReportSpec>): ReportSpec => ({
  ...defaultSpec(ventas),
  ...overrides,
});

describe("aggregate", () => {
  it("suma, cuenta, distingue y promedia por grupo", () => {
    const result = aggregate(
      rows,
      ventas,
      spec({
        groupBy: "vendedor",
        measures: ["facturacion", "ventas", "ticket", "clientes"],
      })
    );
    expect(result.totals).toEqual({
      facturacion: 2000,
      ventas: 4,
      ticket: 500,
      clientes: 3,
    });
    expect(result.rows[0]).toMatchObject({
      label: "Ana",
      values: { facturacion: 1500, ventas: 2, ticket: 750, clientes: 2 },
    });
    expect(result.rows.map((r) => r.label)).toContain("Sin dato");
  });

  it("agrupa fechas por mes en orden cronológico", () => {
    const result = aggregate(
      rows,
      ventas,
      spec({ groupBy: "fecha", grain: "mes" })
    );
    expect(result.rows.map((r) => r.key)).toEqual(["2026-10", "2026-11"]);
  });

  it("corta en el top y junta el resto", () => {
    const result = aggregate(
      rows,
      ventas,
      spec({ groupBy: "cliente", measures: ["facturacion"], limit: 1 })
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      label: "Pendino",
      values: { facturacion: 1300 },
    });
    expect(result.rows[1]).toMatchObject({
      key: REST_KEY,
      values: { facturacion: 700 },
    });
    expect(result.groupCount).toBe(3);
  });

  it("abre la primera métrica por una segunda dimensión", () => {
    const result = aggregate(
      rows,
      ventas,
      spec({
        groupBy: "cliente",
        splitBy: "vendedor",
        measures: ["facturacion"],
      })
    );
    const pendino = result.rows.find((r) => r.label === "Pendino");
    expect(pendino?.split).toMatchObject({ Ana: 1000, Beto: 300 });
  });
});

describe("filtros", () => {
  it("encuentra por coincidencia parcial sin acentos", () => {
    const filtered = applyFilters(
      rows,
      [{ dimension: "cliente", values: ["almacen"] }],
      ventas,
      "dia"
    );
    expect(filtered).toHaveLength(1);
  });
});

describe("fechas", () => {
  it("resuelve los períodos y su comparación", () => {
    expect(resolveRange({ period: "este_mes" }, "2026-11-08")).toEqual({
      from: "2026-11-01",
      to: "2026-11-08",
    });
    expect(resolveRange({ period: "mes_pasado" }, "2026-03-10")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(
      previousRange({ from: "2026-11-01", to: "2026-11-08" }, "este_mes")
    ).toEqual({ from: "2026-10-01", to: "2026-10-08" });
    expect(
      previousRange({ from: "2026-11-01", to: "2026-11-30" }, "ultimos_30")
    ).toEqual({ from: "2026-10-02", to: "2026-10-31" });
  });

  it("agrupa por semana desde el lunes y arma tramos de deuda", () => {
    expect(dateBucket("2026-11-08", "semana").key).toBe("2026-11-02");
    expect(agingBucket("2026-11-20", "2026-11-08")).toBe("Por vencer");
    expect(agingBucket("2026-09-01", "2026-11-08")).toBe(
      "Vencido 61 a 90 días"
    );
  });
});

describe("catálogo", () => {
  it("descarta lo que no existe en la fuente", () => {
    const clean = sanitizeSpec({
      dataset: "ventas",
      groupBy: "inventado",
      measures: ["facturacion", "nada"],
      filters: [{ dimension: "otra", values: ["x"] }],
      limit: 99_999,
    });
    expect(clean).toMatchObject({
      groupBy: "fecha",
      measures: ["facturacion"],
      filters: [],
      limit: 500,
    });
    expect(sanitizeSpec({ dataset: "no-existe" })).toBeNull();
  });

  it("todas las plantillas son válidas", () => {
    for (const template of REPORT_TEMPLATES) {
      const clean = sanitizeSpec(template.spec);
      expect(clean, template.id).not.toBeNull();
      expect(clean?.measures, template.id).toEqual(template.spec.measures);
      expect(clean?.groupBy, template.id).toBe(
        template.spec.groupBy ?? clean?.groupBy
      );
    }
  });
});
