import { describe, expect, it } from "vitest";
import { REST_KEY } from "./aggregate";
import type { ReportResult } from "./run-report";
import {
  argentinaClock,
  describeSchedule,
  isScheduleDue,
  type ReportSchedule,
  reportToWhatsApp,
  sanitizeSchedule,
} from "./whatsapp-report";

const weekly: ReportSchedule = {
  frequency: "semanal",
  weekday: 1,
  monthday: 1,
  hour: 8,
  active: true,
};

describe("programación", () => {
  it("valida y describe", () => {
    expect(
      sanitizeSchedule({ frequency: "semanal", weekday: 9, hour: 30 })
    ).toEqual({
      frequency: "semanal",
      weekday: 6,
      monthday: 1,
      hour: 23,
      active: true,
    });
    expect(sanitizeSchedule({ frequency: "cada tanto" })).toBeNull();
    expect(describeSchedule(weekly)).toBe("Todos los lunes a las 8 h");
    expect(
      describeSchedule({ ...weekly, frequency: "mensual", monthday: 5 })
    ).toBe("El día 5 de cada mes a las 8 h");
  });

  it("usa la hora argentina", () => {
    // Lunes 23/11/2026 11:10 UTC = 8:10 en Buenos Aires.
    const clock = argentinaClock(new Date("2026-11-23T11:10:00Z"));
    expect(clock).toEqual({
      date: "2026-11-23",
      hour: 8,
      weekday: 1,
      monthday: 23,
    });
  });

  it("manda solo el día y la hora elegidos, y una vez", () => {
    const now = new Date("2026-11-23T11:10:00Z");
    const clock = argentinaClock(now);
    expect(isScheduleDue(weekly, clock, null, now)).toBe(true);
    expect(isScheduleDue({ ...weekly, weekday: 2 }, clock, null, now)).toBe(
      false
    );
    expect(isScheduleDue({ ...weekly, hour: 9 }, clock, null, now)).toBe(false);
    expect(isScheduleDue(weekly, clock, "2026-11-23T11:02:00Z", now)).toBe(
      false
    );
    expect(isScheduleDue({ ...weekly, active: false }, clock, null, now)).toBe(
      false
    );
    expect(
      isScheduleDue(
        { ...weekly, frequency: "mensual", monthday: 23 },
        clock,
        null,
        now
      )
    ).toBe(true);
  });
});

describe("texto del reporte", () => {
  const report = {
    title: "Facturación por cliente",
    periodLabel: "Este mes (1 nov. – 23 nov.)",
    groupLabel: "Cliente",
    measures: [
      {
        key: "facturacion",
        label: "Facturación",
        format: "money",
        additive: true,
      },
      { key: "deuda", label: "Deuda vencida", format: "money", additive: true },
    ],
    totals: { facturacion: 1_500_000, deuda: 200_000 },
    previousTotals: { facturacion: 1_000_000, deuda: 250_000 },
    rows: [
      { key: "b", label: "Almacén Sol", values: { facturacion: 500_000 } },
      { key: "a", label: "Pendino", values: { facturacion: 1_000_000 } },
      { key: REST_KEY, label: "Resto", values: { facturacion: 1 } },
    ],
    groupCount: 2,
    factCount: 10,
  } as unknown as ReportResult;

  it("arma totales con variación, ranking y link", () => {
    const text = reportToWhatsApp(report, "https://app/x");
    expect(text).toContain("📊 *Facturación por cliente*");
    expect(text).toContain("🟢 +50%");
    // La deuda baja: es bueno.
    expect(text).toContain("Deuda vencida: *$ 200.000* 🟢 -20%");
    expect(text.indexOf("Pendino")).toBeLessThan(text.indexOf("Almacén Sol"));
    expect(text).not.toContain("Resto");
    expect(text).toContain("https://app/x");
  });
});
