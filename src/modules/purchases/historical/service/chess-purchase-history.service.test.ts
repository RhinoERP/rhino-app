import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), organization: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.organization,
}));

import { collectPurchaseHistoryExport } from "../chess-history";
import {
  getPurchaseHistoryExport,
  getPurchaseHistoryPage,
} from "./chess-purchase-history.service";

function database({
  count = 1,
  permitted = true,
  failAtOffset = -1,
}: {
  count?: number;
  permitted?: boolean;
  failAtOffset?: number;
} = {}) {
  const requests: URL[] = [];
  const fetcher = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname.includes("/rpc/")) {
      return Promise.resolve(Response.json(permitted));
    }
    const from = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    if (from === failAtOffset) {
      return Promise.resolve(
        Response.json({ message: "database failure" }, { status: 500 })
      );
    }
    const length = Math.max(0, Math.min(limit, count - from));
    const rows = Array.from({ length }, (_, i) => ({
      id: `doc-${from + i}`,
      supplier_name: "Hotel Sheraton",
      document_code: "FC",
    }));
    return Promise.resolve(
      Response.json(rows, {
        headers: {
          "Content-Type": "application/json",
          "Content-Range": `${from}-${from + length - 1}/${count}`,
        },
      })
    );
  });
  mocks.client.mockResolvedValue(
    createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    })
  );
  return requests;
}

describe("CHESS purchase history uses a chainable PostgREST query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organization.mockResolvedValue({ id: "org-1" });
  });

  it("searches all suppliers before applying page offset and sort", async () => {
    const requests = database({ count: 65 });
    const result = await getPurchaseHistoryPage("org", {
      page: 2,
      pageSize: 20,
      search: "SHERATON",
      documentCode: "FC",
      dateFrom: "2020-01-01",
    });
    expect(result?.totalCount).toBe(65);
    expect(result?.data).toHaveLength(20);
    const query = requests.find((url) =>
      url.pathname.includes("/historical_purchase_documents")
    );
    expect(query?.searchParams.get("or")).toContain(
      'supplier_name.ilike."%SHERATON%"'
    );
    expect(query?.searchParams.get("offset")).toBe("20");
    expect(query?.searchParams.get("order")).toBe("document_date.desc,id.asc");
    expect(query?.searchParams.get("document_code")).toBe("eq.FC");
    expect(query?.searchParams.get("document_date")).toBe("gte.2020-01-01");
    expect(requests).toHaveLength(2);
  });

  it("returns zero rows for a search without matches", async () => {
    database({ count: 0 });
    expect(
      await getPurchaseHistoryPage("org", {
        page: 1,
        pageSize: 20,
        search: "no-match",
      })
    ).toMatchObject({ data: [], totalCount: 0 });
  });

  it("exports more than one server batch with the same filters and stable ordering", async () => {
    const requests = database({ count: 501 });
    const result = await collectPurchaseHistoryExport((offset) =>
      getPurchaseHistoryExport(
        "org",
        {
          search: "SHERATON",
          dateTo: "2026-11-25",
        },
        offset
      )
    );
    expect(result).toHaveLength(501);
    const pages = requests.filter((url) => !url.pathname.includes("/rpc/"));
    expect(pages.map((url) => url.searchParams.get("offset"))).toEqual([
      "0",
      "500",
    ]);
    for (const page of pages) {
      expect(page.searchParams.get("or")).toContain("SHERATON");
      expect(page.searchParams.get("document_date")).toBe("lte.2026-11-25");
      expect(page.searchParams.get("organization_id")).toBe("eq.org-1");
    }
  });

  it("does not download a partial export if a later page fails", async () => {
    database({ count: 501, failAtOffset: 500 });
    await expect(
      collectPurchaseHistoryExport((offset) =>
        getPurchaseHistoryExport("org", {}, offset)
      )
    ).rejects.toThrow("database failure");
  });

  it("refuses export and list access before querying documents", async () => {
    const requests = database({ permitted: false });
    expect(
      await getPurchaseHistoryPage("org", { page: 1, pageSize: 20 })
    ).toBeNull();
    await expect(getPurchaseHistoryExport("org", {})).rejects.toThrow(
      "No tienes permisos"
    );
    expect(requests.every((url) => url.pathname.includes("/rpc/"))).toBe(true);
  });
});
