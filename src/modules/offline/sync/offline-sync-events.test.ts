import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSalesListOrgSlug,
  getSalesSyncStorageKey,
  offlinePreSaleSyncedEventSchema,
  publishOfflinePreSaleSynced,
  readLatestOfflinePreSaleSync,
} from "./offline-sync-events";

const ownerUserId = "00000000-0000-4000-8000-000000000003";
const organizationId = "00000000-0000-4000-8000-000000000004";
const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("BroadcastChannel", undefined);
});

describe("offline sync events", () => {
  it("valida un evento durable de preventa sincronizada", () => {
    expect(
      offlinePreSaleSyncedEventSchema.parse({
        type: "offline-pre-sale-synced",
        commandId: "00000000-0000-4000-8000-000000000001",
        ownerUserId,
        organizationId,
        orgSlug: "luchobet",
        resourceId: "00000000-0000-4000-8000-000000000002",
        syncedAt: "2026-09-18T12:00:00.000Z",
      })
    ).toMatchObject({ orgSlug: "luchobet" });
  });

  it("persiste y lee el evento en la particion de usuario y organizacion", () => {
    publishOfflinePreSaleSynced({
      type: "offline-pre-sale-synced",
      commandId: "00000000-0000-4000-8000-000000000001",
      ownerUserId,
      organizationId,
      orgSlug: "luchobet",
      resourceId: "00000000-0000-4000-8000-000000000002",
      syncedAt: "2026-09-18T12:00:00.000Z",
    });

    expect(
      readLatestOfflinePreSaleSync(ownerUserId, organizationId)
    ).toMatchObject({ ownerUserId, organizationId, orgSlug: "luchobet" });
    expect(
      readLatestOfflinePreSaleSync(
        "00000000-0000-4000-8000-000000000005",
        organizationId
      )
    ).toBeNull();
  });

  it("elimina marcadores malformados", () => {
    const key = getSalesSyncStorageKey(ownerUserId, organizationId);
    values.set(key, "{malformed");

    expect(
      readLatestOfflinePreSaleSync(ownerUserId, organizationId)
    ).toBeNull();
    expect(values.has(key)).toBe(false);
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
