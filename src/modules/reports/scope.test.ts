import { describe, expect, it } from "vitest";
import { canReadAllReportRows, canUseReports } from "./scope";

describe("alcance de los reportes", () => {
  it("solo el administrador o un rol con reports.manage entra al módulo", () => {
    expect(canUseReports(["sales.read", "customers.read"])).toBe(false);
    expect(canUseReports(["reports.manage"])).toBe(true);
    expect(canUseReports(["organization.admin"])).toBe(true);
  });

  it("una venta propia no habilita datos de ventas ajenas", () => {
    for (const dataset of ["ventas", "ventas_productos"]) {
      expect(canReadAllReportRows(dataset, ["sales.read"])).toBe(false);
      expect(
        canReadAllReportRows(dataset, ["reports.manage", "sales.read"])
      ).toBe(false);
      expect(canReadAllReportRows(dataset, ["sales.manage"])).toBe(false);
      expect(canReadAllReportRows(dataset, ["customers.read.all"])).toBe(false);
      expect(canReadAllReportRows(dataset, ["sales.read.all"])).toBe(true);
      expect(canReadAllReportRows(dataset, ["sales.manage.all"])).toBe(true);
    }
  });

  it("los permisos globales de otros módulos no amplían el alcance de ventas", () => {
    expect(canReadAllReportRows("ventas", ["collections.read.all"])).toBe(
      false
    );
    expect(canReadAllReportRows("notas_credito", ["creditnotes.read"])).toBe(
      false
    );
    expect(canReadAllReportRows("deuda_clientes", ["collections.manage"])).toBe(
      true
    );
    expect(canReadAllReportRows("ventas", ["organization.admin"])).toBe(true);
  });
});
