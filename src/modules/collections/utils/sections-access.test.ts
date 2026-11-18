import { describe, expect, it } from "vitest";
import {
  canManageMeliPayments,
  hasMeliAccess,
} from "@/modules/mercadolibre/permissions";
import { getCollectionsSectionsAccess } from "./sections-access";

const enabled = { wholesale_enabled: true, pos_enabled: true };

describe("collections section authorization", () => {
  it("lets financial Meli readers enter only their operational collection section", () => {
    const permissions = ["mercadolibre.payments.read"];
    expect(getCollectionsSectionsAccess(enabled, permissions)).toEqual({
      currentAccounts: false,
      mercadoLibre: true,
    });
    expect(canManageMeliPayments(permissions)).toBe(false);
    expect(hasMeliAccess(permissions)).toBe(false);
  });
  it("supports Meli collections without the wholesale module or POS/cash-register access", () => {
    const permissions = ["mercadolibre.payments.manage"];
    expect(
      getCollectionsSectionsAccess(
        { ...enabled, wholesale_enabled: false },
        permissions
      )
    ).toEqual({ currentAccounts: false, mercadoLibre: true });
    expect(canManageMeliPayments(permissions)).toBe(true);
    expect(hasMeliAccess(permissions)).toBe(false);
  });
  it("does not promote sales, invoice or legacy collection roles into Meli money management", () => {
    expect(
      getCollectionsSectionsAccess(enabled, [
        "mercadolibre.manage",
        "mercadolibre.invoice",
      ])
    ).toEqual({ currentAccounts: false, mercadoLibre: false });
    expect(
      getCollectionsSectionsAccess(enabled, ["collections.manage"])
    ).toEqual({ currentAccounts: true, mercadoLibre: false });
  });
  it("respects module deactivation and organization administration", () => {
    expect(
      getCollectionsSectionsAccess({ ...enabled, pos_enabled: false }, [
        "mercadolibre.payments.manage",
      ])
    ).toEqual({ currentAccounts: false, mercadoLibre: false });
    expect(
      getCollectionsSectionsAccess(enabled, ["organization.admin"])
    ).toEqual({ currentAccounts: true, mercadoLibre: true });
  });
});
