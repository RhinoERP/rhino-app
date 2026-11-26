import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountingServiceError } from "@/lib/accounting-server";
import { changeMeliPostingPeriodAction } from "./meli-period.action";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  module: vi.fn(),
  enabled: vi.fn(),
  auth: vi.fn(),
  org: vi.fn(),
  change: vi.fn(),
}));
vi.mock("@/lib/accounting-server", () => ({
  AccountingServiceError: class MockAccountingServiceError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  changeMeliPostingPeriodServer: mocks.change,
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("@/modules/accounting/service/accounting-integration.service", () => ({
  isMeliAccountingIntegrationEnabled: mocks.enabled,
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: mocks.module,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.org,
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));

const id = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const input = {
  periodStart: "2026-11-01",
  expectedStatus: "UNCONFIGURED",
  newStatus: "OPEN",
  reason: "  Apertura inicial  ",
  requestKey: id,
  expectedActorId: actor,
};

describe("administración de período Meli", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enabled.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ userId: actor });
    mocks.org.mockResolvedValue({ id });
    mocks.change.mockResolvedValue({ status: "OPEN", idempotent: false });
  });
  it("uses the authorized actor and organization with a durable request", async () => {
    await expect(changeMeliPostingPeriodAction("org", input)).resolves.toEqual({
      success: true,
      data: { status: "OPEN", idempotent: false },
    });
    expect(mocks.ensure).toHaveBeenCalledWith("accounting.manage", "org");
    expect(mocks.ensure).toHaveBeenCalledWith(
      "mercadolibre.accounting.manage",
      "org"
    );
    expect(mocks.module).toHaveBeenCalledWith("org", "pos");
    expect(mocks.change).toHaveBeenCalledWith({
      periodStart: input.periodStart,
      expectedStatus: input.expectedStatus,
      newStatus: input.newStatus,
      requestKey: input.requestKey,
      reason: "Apertura inicial",
      orgId: id,
      actorId: actor,
    });
  });
  it("does not replay a saved request under a different logged-in actor", async () => {
    await expect(
      changeMeliPostingPeriodAction("org", { ...input, expectedActorId: id })
    ).rejects.toThrow("otro usuario");
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("rejects forged identities, disabled integration and missing permissions", async () => {
    await expect(
      changeMeliPostingPeriodAction("org", { ...input, actorId: id })
    ).rejects.toThrow();
    mocks.enabled.mockResolvedValueOnce(false);
    await expect(changeMeliPostingPeriodAction("org", input)).rejects.toThrow(
      "no está habilitada"
    );
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(changeMeliPostingPeriodAction("org", input)).rejects.toThrow(
      "Sin permiso"
    );
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("reports uncertain writes without inventing a new key", async () => {
    mocks.change.mockRejectedValueOnce(new Error("Sin respuesta"));
    await expect(changeMeliPostingPeriodAction("org", input)).rejects.toThrow(
      "misma solicitud"
    );
    expect(mocks.change).toHaveBeenCalledWith(
      expect.objectContaining({ requestKey: id })
    );
  });

  it("distinguishes a definite stale-state conflict from an uncertain response", async () => {
    mocks.change.mockRejectedValueOnce(
      new AccountingServiceError("El período cambió.", 409)
    );
    await expect(changeMeliPostingPeriodAction("org", input)).resolves.toEqual({
      success: false,
      error: "El período cambió.",
    });
  });
});
