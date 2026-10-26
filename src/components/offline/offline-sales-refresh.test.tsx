import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSalesSyncStorageKey,
  type OfflinePreSaleSyncedEvent,
} from "@/modules/offline/sync/offline-sync-events";

const state = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  pathname: "/org/acme/ventas",
  refs: [] as { current: unknown }[],
  refIndex: 0,
}));
const invalidateQueries = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({
  useEffect: (effect: () => undefined | (() => void)) => {
    const cleanup = effect();
    if (cleanup) {
      state.cleanups.push(cleanup);
    }
  },
  useRef: (initial: unknown) => {
    const index = state.refIndex;
    state.refIndex += 1;
    state.refs[index] ??= { current: initial };
    return state.refs[index];
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ refresh }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

import { OfflineSalesRefresh } from "./offline-sales-refresh";

const ownerUserId = "00000000-0000-4000-8000-000000000003";
const organizationId = "00000000-0000-4000-8000-000000000004";
const storage = new Map<string, string>();

class FakeBroadcastChannel extends EventTarget {
  static instances: FakeBroadcastChannel[] = [];
  close = vi.fn();
  constructor(_name: string) {
    super();
    FakeBroadcastChannel.instances.push(this);
  }
}

const makeEvent = (
  overrides: Partial<OfflinePreSaleSyncedEvent> = {}
): OfflinePreSaleSyncedEvent => ({
  type: "offline-pre-sale-synced",
  commandId: "00000000-0000-4000-8000-000000000001",
  ownerUserId,
  organizationId,
  orgSlug: "acme",
  resourceId: "00000000-0000-4000-8000-000000000002",
  syncedAt: new Date().toISOString(),
  ...overrides,
});

const dispatchWith = (target: EventTarget, type: string, values: object) => {
  const event = new Event(type);
  Object.assign(event, values);
  target.dispatchEvent(event);
};

const render = () => {
  state.refIndex = 0;
  OfflineSalesRefresh({ organizationId, orgSlug: "acme", ownerUserId });
};

describe("OfflineSalesRefresh", () => {
  beforeEach(() => {
    for (const cleanup of state.cleanups.splice(0)) {
      cleanup();
    }
    state.pathname = "/org/acme/ventas";
    state.refs = [];
    state.refIndex = 0;
    storage.clear();
    FakeBroadcastChannel.instances = [];
    invalidateQueries.mockClear();
    refresh.mockClear();
    vi.stubGlobal("window", new EventTarget());
    const documentTarget = new EventTarget();
    Object.defineProperty(documentTarget, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  it("consume el marcador guardado al montar e invalida ambas consultas", () => {
    storage.set(
      getSalesSyncStorageKey(ownerUserId, organizationId),
      JSON.stringify(makeEvent())
    );
    render();

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["sales", "acme"],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["pre-sales", "acme"],
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("ignora otra organizacion y eventos malformados o duplicados", () => {
    render();
    const channel = FakeBroadcastChannel.instances[0];
    dispatchWith(channel, "message", { data: makeEvent({ orgSlug: "other" }) });
    dispatchWith(channel, "message", {
      data: makeEvent({
        ownerUserId: "00000000-0000-4000-8000-000000000008",
      }),
    });
    dispatchWith(channel, "message", {
      data: makeEvent({ syncedAt: "2020-01-01T00:00:00.000Z" }),
    });
    dispatchWith(channel, "message", { data: { type: "invalid" } });
    dispatchWith(channel, "message", { data: makeEvent() });
    dispatchWith(channel, "message", { data: makeEvent() });

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("consume storage fallback, visibilidad y pageshow BFCache", () => {
    render();
    const key = getSalesSyncStorageKey(ownerUserId, organizationId);
    const first = makeEvent();
    dispatchWith(window, "storage", {
      key,
      newValue: JSON.stringify(first),
    });
    storage.set(
      key,
      JSON.stringify(
        makeEvent({ commandId: "00000000-0000-4000-8000-000000000005" })
      )
    );
    document.dispatchEvent(new Event("visibilitychange"));
    storage.set(
      key,
      JSON.stringify(
        makeEvent({ commandId: "00000000-0000-4000-8000-000000000006" })
      )
    );
    dispatchWith(window, "pageshow", { persisted: true });

    expect(invalidateQueries).toHaveBeenCalledTimes(6);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("consume en navegacion y limpia listeners y canal", () => {
    const key = getSalesSyncStorageKey(ownerUserId, organizationId);
    storage.set(key, JSON.stringify(makeEvent()));
    state.pathname = "/org/acme/inicio";
    render();
    expect(refresh).not.toHaveBeenCalled();

    const firstCleanup = state.cleanups.pop();
    firstCleanup?.();
    state.pathname = "/org/acme/ventas";
    render();
    expect(refresh).toHaveBeenCalledOnce();

    const channel = FakeBroadcastChannel.instances.at(-1);
    const cleanup = state.cleanups.pop();
    cleanup?.();
    dispatchWith(window, "storage", {
      key,
      newValue: JSON.stringify(
        makeEvent({ commandId: "00000000-0000-4000-8000-000000000007" })
      ),
    });
    expect(channel?.close).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
