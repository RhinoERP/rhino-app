import { describe, expect, it, vi } from "vitest";
import { canViewAllPos } from "./pos-sessions.service";

vi.mock("server-only", () => ({}));

describe("POS read scope", () => {
  it("does not promote Mercado Libre permission to global POS access", () => {
    expect(canViewAllPos(["mercadolibre.access"])).toBe(false);
    expect(canViewAllPos(["mercadolibre.access", "pos.read"])).toBe(false);
    expect(canViewAllPos(["mercadolibre.manage"])).toBe(false);
  });
  it("keeps administrator and global POS capabilities", () => {
    for (const permission of [
      "organization.admin",
      "pos.read.all",
      "pos.manage",
    ]) {
      expect(canViewAllPos([permission])).toBe(true);
    }
  });
});
