import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getOrganizationLayoutData,
  getUserOrganizations,
  resolveUserRedirect,
} from "./organizations.service";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ isSuperAdmin: vi.fn() }));

const organization = {
  id: "org-1",
  slug: "demo",
  name: "Demo",
  is_active: true,
  wholesale_enabled: true,
};
const claims = { sub: "user-1", email: "demo@example.com" };

function mockSession({
  authenticated = true,
  memberships = [{ organization }],
  error = null,
}: {
  authenticated?: boolean;
  memberships?: { organization: typeof organization | null }[];
  error?: { message: string; code: string } | null;
} = {}) {
  const query = Object.assign(
    Promise.resolve({ data: error ? null : memberships, error }),
    { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
  );
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: claims.sub } : null },
      }),
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: authenticated ? claims : null },
      }),
    },
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: ["dashboard.read"], error: null }),
  };
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return { client, query };
}

describe("organization access after login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
  });

  it("sends an authenticated member to their organization using the direct membership relation", async () => {
    const { query } = mockSession();

    await expect(resolveUserRedirect()).resolves.toBe("/org/demo");
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "organization:organizations!organization_members_organization_id_fkey("
      )
    );
  });

  it("only sends an unauthenticated user to login", async () => {
    const { client } = mockSession({ authenticated: false });

    await expect(resolveUserRedirect()).resolves.toBe("/auth/login");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("sends an authenticated user without memberships to the no-org page", async () => {
    mockSession({ memberships: [] });

    await expect(resolveUserRedirect()).resolves.toBe("/no-org");
  });

  it("does not misrepresent a membership database error as a missing session", async () => {
    mockSession({
      error: { code: "PGRST201", message: "Ambiguous relationship" },
    });

    await expect(resolveUserRedirect()).rejects.toThrow(
      "Error fetching user organizations: Ambiguous relationship"
    );
  });

  it("loads the authenticated organization layout using the direct membership relation", async () => {
    const { query } = mockSession();

    await expect(getOrganizationLayoutData("demo")).resolves.toEqual({
      user: claims,
      organizations: [organization],
      currentOrganization: organization,
      permissions: ["dashboard.read"],
    });
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "organization:organizations!organization_members_organization_id_fkey("
      )
    );
  });

  it("does not redirect out of a valid session when the organization query fails", async () => {
    mockSession({
      error: { code: "PGRST201", message: "Ambiguous relationship" },
    });

    await expect(getOrganizationLayoutData("demo")).rejects.toThrow(
      "Error fetching user organizations: Ambiguous relationship"
    );
  });

  it("does not grant access to a different organization", async () => {
    mockSession();

    await expect(getOrganizationLayoutData("other")).resolves.toBeNull();
  });

  it("loads the organization switcher using the direct membership relation", async () => {
    const { query } = mockSession();

    await expect(getUserOrganizations()).resolves.toEqual([organization]);
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "organization:organizations!organization_members_organization_id_fkey("
      )
    );
  });
});
