import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { access, from, maybeSingle } = vi.hoisted(() => ({
  access: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesAccessContext: access,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ orgSlug: "org" }) };
const body = {
  customerId: id,
  address: "San Martín 123",
  city: "Rosario",
  postalCode: "2000",
};
function request(input: unknown = body) {
  return new NextRequest(
    "http://localhost/api/org/org/commercial-visits/geocode",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

describe("customer site address search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockResolvedValue({ userId: id, isOrganizationAdmin: true });
    maybeSingle.mockResolvedValue({
      data: { id, assigned_seller_id: null, is_active: true },
      error: null,
    });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    from.mockReturnValue(query);
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted: "San Martín 123, Rosario, Argentina",
              lat: -32.95,
              lon: -60.66,
              country_code: "ar",
              housenumber: "123",
            },
            { formatted: "Other", lat: 1, lon: 1, country_code: "us" },
          ],
        }),
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requires admin privileges before calling the provider", async () => {
    access.mockResolvedValue({
      userId: id,
      canManage: false,
      isOrganizationAdmin: false,
    });
    const { POST } = await import("./route");
    expect((await POST(request(), context)).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not search for a customer outside the organization", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("./route");
    expect((await POST(request(), context)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lets a seller search only for own or unassigned customers", async () => {
    access.mockResolvedValue({
      userId: id,
      canManage: true,
      isOrganizationAdmin: false,
    });
    maybeSingle.mockResolvedValueOnce({
      data: {
        id,
        assigned_seller_id: "22222222-2222-4222-8222-222222222222",
        is_active: true,
      },
      error: null,
    });
    const { POST } = await import("./route");
    expect((await POST(request(), context)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect((await POST(request(), context)).status).toBe(200);
  });

  it("keeps the key server-side and limits results to Argentina", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const result = await response.json();
    expect(result.candidates).toEqual([
      {
        label: "San Martín 123, Rosario, Argentina",
        latitude: -32.95,
        longitude: -60.66,
        exactNumber: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("test-key");
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.get("text")).toContain("2000");
    expect(url.searchParams.get("filter")).toBe("countrycode:ar");
  });

  it("does not search when the provider key is missing", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    const { POST } = await import("./route");
    expect((await POST(request(), context)).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
