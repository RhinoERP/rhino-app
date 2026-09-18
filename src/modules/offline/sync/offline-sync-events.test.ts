import { describe, expect, it } from "vitest";
import {
  getSalesListOrgSlug,
  offlinePreSaleSyncedEventSchema,
} from "./offline-sync-events";

describe("offline sync events", () => {
  it("valida un evento durable de preventa sincronizada", () => {
    expect(
      offlinePreSaleSyncedEventSchema.parse({
        type: "offline-pre-sale-synced",
        commandId: "00000000-0000-4000-8000-000000000001",
        orgSlug: "luchobet",
        resourceId: "00000000-0000-4000-8000-000000000002",
        syncedAt: "2026-09-18T12:00:00.000Z",
      })
    ).toMatchObject({ orgSlug: "luchobet" });
  });

  it("identifica solamente el listado principal de ventas", () => {
    expect(getSalesListOrgSlug("/org/luchobet/ventas")).toBe("luchobet");
    expect(getSalesListOrgSlug("/org/luchobet/ventas/")).toBe("luchobet");
    expect(getSalesListOrgSlug("/org/luchobet/ventas/venta-1")).toBeNull();
    expect(getSalesListOrgSlug("/~offline/borradores")).toBeNull();
  });

  it("rechaza notificaciones genericas como eventos exitosos", () => {
    expect(
      offlinePreSaleSyncedEventSchema.safeParse({
        type: "offline-command-status",
        commandId: "00000000-0000-4000-8000-000000000001",
      }).success
    ).toBe(false);
  });
});
