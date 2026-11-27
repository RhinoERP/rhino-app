import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { secureLogout } from "./secure-logout";

const { purge, clear, signOut, replace } = vi.hoisted(() => ({
  purge: vi.fn(),
  clear: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/modules/offline/storage/offline-db", () => ({
  purgeAllOfflineData: purge,
}));
vi.mock("@/lib/get-query-client", () => ({
  getQueryClient: () => ({ clear }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

describe("secureLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { replace } });
    purge.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("purges offline data before signing out and leaving the page", async () => {
    await secureLogout();
    expect(purge).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
    expect(purge.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0]
    );
    expect(replace).toHaveBeenCalledWith("/auth/login");
  });

  it("keeps the session open if local data cannot be deleted", async () => {
    purge.mockRejectedValue(new Error("IndexedDB unavailable"));
    await expect(secureLogout()).rejects.toThrow(
      "No se pudieron borrar los datos offline"
    );
    expect(clear).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not navigate away if Supabase rejects sign-out", async () => {
    signOut.mockResolvedValue({ error: new Error("Auth unavailable") });
    await expect(secureLogout()).rejects.toThrow("No se pudo cerrar la sesión");
    expect(replace).not.toHaveBeenCalled();
  });
});
