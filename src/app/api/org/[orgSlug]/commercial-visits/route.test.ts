import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, access } = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
  }),
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesAccessContext: access,
}));
vi.mock("@/modules/commercial-visits/service/route-actors.service", () => ({
  withRouteActorNames: async (value: unknown) => value,
}));
vi.mock("@/modules/commercial-visits/service/document-actors.service", () => ({
  withDocumentActorNames: async (value: unknown) => value,
}));

const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ orgSlug: "org" }) };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/org/org/commercial-visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("commercial site API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockResolvedValue({
      userId: id,
      canManage: true,
      isOrganizationAdmin: false,
    });
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it("requires an admin to save a branch", async () => {
    const { POST } = await import("./route");
    const command = {
      action: "saveSite",
      customerId: id,
      name: "Sucursal",
      address: "Calle 123",
      city: "Rosario",
      active: true,
      latitude: null,
      longitude: null,
    };
    expect((await POST(request(command), context)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    access.mockResolvedValue({
      userId: id,
      canManage: true,
      isOrganizationAdmin: true,
    });
    expect((await POST(request(command), context)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "commercial_site_save_with_postcode",
      expect.objectContaining({
        p_customer: id,
        p_name: "Sucursal",
        p_postal_code: "",
        p_lat: null,
        p_lng: null,
      })
    );
  });

  it("requires the selected site for a visit and passes it to the site-scoped RPC", async () => {
    const { POST } = await import("./route");
    expect(
      (
        await POST(
          request({ action: "addToRoute", routeId: id, customerId: id }),
          context
        )
      ).status
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({
            action: "addToRoute",
            routeId: id,
            customerId: id,
            siteId: id,
          }),
          context
        )
      ).status
    ).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "commercial_route_add_site_visit",
      expect.objectContaining({ p_site: id })
    );
  });

  it("loads scoped branches without caching", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        `http://localhost/api/org/org/commercial-visits?view=sites&customerId=${id}`
      ),
      context
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(rpc).toHaveBeenCalledWith(
      "commercial_site_catalog",
      expect.objectContaining({ p_customer: id })
    );
  });

  it("keeps existing site edits working before the postal-code migration", async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "missing" },
      })
      .mockResolvedValueOnce({ data: id, error: null });
    access.mockResolvedValue({
      userId: id,
      canManage: true,
      isOrganizationAdmin: true,
    });
    const { POST } = await import("./route");
    const command = {
      action: "saveSite",
      customerId: id,
      name: "Sucursal",
      address: "Calle 123",
      city: "Rosario",
      postalCode: "",
      active: true,
      latitude: null,
      longitude: null,
    };
    expect((await POST(request(command), context)).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith(
      "commercial_site_save",
      expect.not.objectContaining({ p_postal_code: expect.anything() })
    );
    rpc.mockClear();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "missing" },
    });
    expect(
      (await POST(request({ ...command, postalCode: "2000" }), context)).status
    ).toBe(503);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("loads the authorized site catalog for the map without caching", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/org/org/commercial-visits?view=mapSites"
      ),
      context
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(rpc).toHaveBeenCalledWith(
      "commercial_site_catalog",
      expect.objectContaining({ p_org: id })
    );
    expect(rpc.mock.lastCall?.[1]).not.toHaveProperty("p_customer");

    access.mockResolvedValue({
      userId: id,
      canManage: false,
      isOrganizationAdmin: false,
    });
    expect(
      (
        await GET(
          new NextRequest(
            "http://localhost/api/org/org/commercial-visits?view=mapSites"
          ),
          context
        )
      ).status
    ).toBe(403);
  });

  it("allows a seller to propose a site point but never to approve it", async () => {
    const { POST } = await import("./route");
    const proposal = {
      action: "proposeSite",
      customerId: id,
      name: "Sucursal nueva",
      address: "Calle 123",
      city: "Rosario",
      postalCode: "2000",
      latitude: -32.95,
      longitude: -60.66,
    };
    expect((await POST(request(proposal), context)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "commercial_site_propose_from_customer",
      expect.objectContaining({
        p_customer: id,
        p_site: null,
        p_postal_code: "2000",
      })
    );
    rpc.mockClear();
    expect(
      (
        await POST(
          request({
            action: "decideSiteProposal",
            proposalId: id,
            approved: true,
          }),
          context
        )
      ).status
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("only permits admins to read the full proposal queue", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { GET } = await import("./route");
    const base =
      "http://localhost/api/org/org/commercial-visits?view=siteProposals";
    expect((await GET(new NextRequest(base), context)).status).toBe(403);
    expect(
      (await GET(new NextRequest(`${base}&customerId=${id}`), context)).status
    ).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith(
      "commercial_site_proposal_queue",
      expect.objectContaining({ p_customer: id })
    );
  });
});
