import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const getOrganizationBySlugMock = vi.fn();

vi.mock("@/lib/supabase/auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: getOrganizationBySlugMock,
}));

function createMembershipQuery(result: {
  data: { organization_id: string } | null;
  error: { message: string } | null;
}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

describe("accounting proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ACCOUNTING_SERVICE_URL = "http://accounting.internal";
    process.env.ACCOUNTING_SERVICE_TOKEN = "service-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sobrescribe org_id en query y body antes de forwardear", async () => {
    const membershipQuery = createMembershipQuery({
      data: { organization_id: "org-server" },
      error: null,
    });

    requireAuthMock.mockResolvedValue({
      userId: "user-1",
      supabase: {
        from: vi.fn().mockReturnValue(membershipQuery),
      },
    });
    getOrganizationBySlugMock.mockResolvedValue({
      id: "org-server",
      slug: "acme",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/contabilidad/eventos?org_id=evil-org&org_slug=evil-slug",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-org-slug": "acme",
        },
        body: JSON.stringify({
          org_id: "evil-org",
          orgId: "evil-org",
          orgSlug: "evil-slug",
          descripcion: "demo",
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ route: ["eventos"] }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [forwardedUrl, forwardedInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(forwardedUrl.toString()).toContain("/eventos?");
    expect(forwardedUrl.searchParams.get("org_id")).toBe("org-server");
    expect(forwardedUrl.searchParams.get("org_slug")).toBeNull();

    const forwardedBody = JSON.parse(String(forwardedInit.body)) as Record<
      string,
      string
    >;
    expect(forwardedBody.org_id).toBe("org-server");
    expect(forwardedBody.orgId).toBe("org-server");
    expect(forwardedBody.orgSlug).toBe("acme");
  });

  it("rechaza el request si el usuario no pertenece a la organización", async () => {
    const membershipQuery = createMembershipQuery({
      data: null,
      error: null,
    });

    requireAuthMock.mockResolvedValue({
      userId: "user-1",
      supabase: {
        from: vi.fn().mockReturnValue(membershipQuery),
      },
    });
    getOrganizationBySlugMock.mockResolvedValue({
      id: "org-server",
      slug: "acme",
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/contabilidad/cuentas?org_id=evil-org",
      {
        method: "GET",
        headers: {
          "x-org-slug": "acme",
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ route: ["cuentas"] }),
    });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    const body = (await response.json()) as { error: string; ok?: boolean };
    expect(body.error).toContain("Sin acceso");
  });
});
